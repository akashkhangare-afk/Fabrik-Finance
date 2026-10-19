import "server-only";
import type { AskThread, ID, ISODate, Transaction, Vendor } from "@/lib/types";
import type { AskAnswer, AskSource } from "@/lib/ask-types";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { addDays, addMonths, monthEnd, monthName, periodOf, prettyDate, prettyDateTime, quarterOf, quarterRange, today } from "@/lib/dates";
import { money, moneyCompact, plural, signedPct } from "@/lib/format";
import { similarity } from "@/server/engines/matching";
import { balances, buildPostings, totalsBySubtype } from "@/server/engines/ledger";
import { runScenario, SCENARIO_DEFAULTS } from "@/server/engines/scenarios";
import { readiness } from "@/server/engines/funding-match";
import { arAging, forecastInput, getForecast, getKpis, ledgerDataFor, openBills, openReceivables, scenarioBaseline } from "./finance";
import { fundingMatches, getProfile, readinessContext } from "./funding";
import { accountName } from "./transactions";
import { currentClose, periodLabel } from "./close";
import { recordAudit } from "./audit";
import { showExtras } from "@/server/config";
import { phrase } from "@/server/ai/gateway";
import type { Ctx } from "@/server/auth/session";
import { SUBTYPES, subtypeMeta } from "@/server/domain/coa";
import type { PurposeTag } from "@/lib/types";

/**
 * Ask Fabrik (PRD §13, Expo §21–22). A Finance Router classifies the question, extracts entities
 * (period, vendor, category, amount), and dispatches to Books / Bills / Collect / Funding / CFO /
 * Documents. Answers are computed from the organization's data; an optional LLM may only rephrase
 * the grounded summary. Read-only: it never moves money or changes records.
 */

export const SUGGESTED_QUESTIONS = [
  "What government programs could potentially help Smith Family Farms expand?",
  "What documents do we already have for these applications?",
  "Can we afford to purchase another $1 million of farmland?",
  "How much did we spend on equipment this year?",
  "Show me payments to John Deere.",
  "Which bills are due this month?",
  "Who owes us more than $20,000?",
  "Why did profit decline last quarter?",
  "Why did expenses increase in September?",
  "Show me the invoice for the John Deere purchase.",
  "What is our current cash position?",
  "Who are our largest vendors?",
];

const CATEGORY_SYNONYMS: [RegExp, string[]][] = [
  [/equipment|machinery|machine/, ["equipment_machinery", "machinery"]],
  [/fuel|diesel|gas\b|gasoline/, ["fuel"]],
  [/seed/, ["seed"]],
  [/fertili[sz]er|lime/, ["fertilizer"]],
  [/chemical|herbicide|pesticide|spray/, ["chemicals"]],
  [/repair|maintenance/, ["repairs"]],
  [/marketing|advertis/, ["marketing"]],
  [/travel|trips?|hotel|flights?/, ["travel"]],
  [/rent|lease/, ["cash_rent", "rent"]],
  [/labor|wages|payroll|salar/, ["wages", "payroll_taxes"]],
  [/insurance/, ["insurance"]],
  [/utilit|electric|power/, ["utilities"]],
  [/software|subscription/, ["software"]],
  [/interest/, ["interest"]],
  [/freight|trucking|hauling/, ["freight"]],
  [/drying|storage/, ["storage_drying"]],
  [/office/, ["office_supplies"]],
  [/legal|accounting|professional/, ["professional_fees"]],
  [/custom hire|custom work/, ["custom_hire"]],
];

interface Period {
  from: ISODate;
  to: ISODate;
  label: string;
}

function parsePeriod(q: string): Period | undefined {
  const d = today();
  const y = Number(d.slice(0, 4));
  if (/last year|previous year|in (20\d\d)/.test(q)) {
    const m = q.match(/in (20\d\d)/);
    const yr = m ? Number(m[1]) : y - 1;
    return { from: `${yr}-01-01`, to: yr === y ? d : `${yr}-12-31`, label: String(yr) };
  }
  if (/this year|ytd|year to date|so far/.test(q)) return { from: `${y}-01-01`, to: d, label: "this year" };
  if (/this month/.test(q)) return { from: `${periodOf(d)}-01`, to: d, label: "this month" };
  if (/last month/.test(q)) {
    const p = addMonths(periodOf(d), -1);
    return { from: `${p}-01`, to: monthEnd(p), label: monthName(p) };
  }
  if (/last quarter|previous quarter/.test(q)) {
    const { year, q: qq } = quarterOf(d);
    const pq = qq === 1 ? { year: year - 1, q: 4 } : { year, q: qq - 1 };
    const r = quarterRange(pq.year, pq.q);
    return { ...r, label: `Q${pq.q} ${pq.year}` };
  }
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b${months[i]}\\b|\\b${months[i]!.slice(0, 3)}\\b`).test(q)) {
      let yr = y;
      if (`${y}-${String(i + 1).padStart(2, "0")}` > periodOf(d)) yr = y - 1;
      const p = `${yr}-${String(i + 1).padStart(2, "0")}`;
      return { from: `${p}-01`, to: monthEnd(p) < d ? monthEnd(p) : d, label: `${monthName(p)} ${yr}` };
    }
  }
  return undefined;
}

function parseAmount(q: string): number | undefined {
  const m = q.match(/\$\s?([\d,.]+)\s*(k|m|million|thousand)?|([\d,.]+)\s*(million|thousand|k|m)\b/i);
  if (!m) return undefined;
  const n = parseFloat((m[1] ?? m[3]!).replace(/,/g, ""));
  const unit = (m[2] ?? m[4] ?? "").toLowerCase();
  return n * (unit === "m" || unit === "million" ? 1_000_000 : unit === "k" || unit === "thousand" ? 1000 : 1);
}

function findVendor(orgId: ID, q: string): Vendor | undefined {
  const vendors = db().vendors.filter((v) => v.orgId === orgId);
  let best: { v: Vendor; s: number } | undefined;
  for (const v of vendors) {
    const s = Math.max(similarity(v.name, q), ...v.aliases.map((a) => similarity(a, q) * 0.9));
    const nameHit = q.includes(v.name.toLowerCase().split(" (")[0]!) ? 1 : 0;
    const score = Math.max(s, nameHit);
    if (score > 0.25 && (!best || score > best.s || (score === best.s && v.name.length < best.v.name.length))) best = { v, s: score };
  }
  // Prefer the purchase relationship over e.g. a loan vendor with a similar name.
  return best?.v;
}

function sourceAccounting(orgId: ID): AskSource {
  const c = db().connections.find((x) => x.orgId === orgId && x.provider === "quickbooks_online");
  return { kind: "accounting", label: "QuickBooks Online", detail: c?.lastSyncAt ? `Synced ${prettyDateTime(c.lastSyncAt)} UTC` : "Not synced", href: "/integrations" };
}

const usd = (c: number) => money(c);
const ACTION = /\b(transfer|wire|send (money|payment|\$)|pay (this|the|that|an?)\b|pay\b.*\binvoice|make a payment|schedule (a )?payment|move \$|move money|approve (the|this) bill|delete|cancel (the|this))\b/;

export async function askQuestion(ctx: Ctx, input: { question: string; threadId?: ID }) {
  const data = db();
  const question = input.question.trim().slice(0, 500);
  if (!question) throw new Error("Ask a question");
  let thread = input.threadId ? data.askThreads.find((t) => t.id === input.threadId && t.orgId === ctx.org.id && t.userId === ctx.user.id) : undefined;
  const now = new Date().toISOString();
  if (!thread) {
    thread = { id: newId("ask"), orgId: ctx.org.id, userId: ctx.user.id, title: question.slice(0, 80), messages: [], context: {}, createdAt: now, updatedAt: now };
    data.askThreads.push(thread);
  }
  thread.messages.push({ id: newId("msg"), role: "user", content: question, at: now });
  let answer = route(ctx, question.toLowerCase(), thread);
  const phrased = await phrase(answer);
  if (phrased) answer = { ...answer, summary: phrased.text, phrasedBy: phrased.model };
  thread.messages.push({ id: newId("msg"), role: "assistant", content: answer.summary, at: new Date().toISOString(), answer });
  thread.updatedAt = new Date().toISOString();
  thread.context.lastIntent = answer.intent;
  recordAudit(ctx, { orgId: ctx.org.id, action: "ask.answered", entity: { type: "ask_thread", id: thread.id, label: question.slice(0, 60) }, after: { intent: answer.intent, modules: answer.modules, grounding: answer.grounding } });
  commit();
  return { thread, answer };
}

function route(ctx: Ctx, q: string, thread: AskThread): AskAnswer {
  const orgId = ctx.org.id;
  if (ACTION.test(q)) {
    return {
      intent: "action_refused",
      modules: [],
      refused: true,
      summary: "I can't do that — Ask Fabrik is read-only in this release, so it never moves money, pays bills or changes records. I can show you the information you need to do it yourself.",
      sources: [],
      followUps: ["Which bills are due this month?", "What is our current cash position?"],
      grounding: "grounded",
    };
  }
  if (/document|paperwork|what do we have/.test(q) && /(application|program|these|funding|loan|grant)/.test(q)) return fundingDocuments(ctx, thread);
  if (/(program|grant|usda|fsa|government|funding|assistance|incentive|cost[- ]share)/.test(q)) return fundingPrograms(ctx, q, thread);
  if (/(afford|can we (buy|purchase)|should we (buy|purchase)|what if we (buy|purchase|hire))/.test(q)) return affordability(ctx, q);
  if (/(invoice|receipt|document).*(for|from)|show me the (invoice|receipt)/.test(q)) return findDocument(ctx, q);
  if (/forecast|next 13 weeks|run out of cash|13[- ]week/.test(q)) return forecastAnswer(ctx);
  if (/cash (position|balance)|how much cash|cash do we have/.test(q)) return cashPosition(ctx);
  if (/bills?\b.*(due|upcoming|coming|owe)|what do we owe/.test(q)) return billsDue(ctx, q);
  if (/who owes|owes us|receivable|outstanding invoices|overdue invoices/.test(q)) return whoOwes(ctx, q);
  if (/(largest|biggest|top) (vendors|suppliers|payees)/.test(q)) return topVendors(ctx, q);
  if (/why did (profit|net income|earnings)/.test(q)) return profitVariance(ctx);
  if (/why (did|have|are) (expenses|costs|spending)/.test(q)) return expenseVariance(ctx, q);
  if (/compare revenue|revenue.*(compare|vs|versus|last quarter|previous quarter)/.test(q)) return revenueCompare(ctx);
  if (showExtras() && /books? (status|closed|ready)|monthly close|close status/.test(q)) return booksStatus(ctx);
  const vendor = /(pay|paid|payments?|spend|spent|transactions?)\b/.test(q) ? findVendor(orgId, q) : undefined;
  if (vendor && /(payments? to|paid|pay|show)/.test(q) && !CATEGORY_SYNONYMS.some(([re]) => re.test(q) && !q.includes(vendor.name.toLowerCase()))) return vendorPayments(ctx, vendor, q);
  if (/(spend|spent|cost|expenses?|pay|paid)/.test(q)) return categorySpend(ctx, q);
  if (/revenue|sales|income|profit|margin/.test(q)) return financialSummary(ctx);
  return {
    intent: "fallback",
    modules: [],
    summary: "I'm not sure how to answer that yet. I can answer questions about your books, bills, receivables, cash forecast, scenarios, funding programs and documents.",
    followUps: SUGGESTED_QUESTIONS.slice(0, 5),
    sources: [],
    grounding: "no_data",
  };
}

// ─── Books ───────────────────────────────────────────────────────────────────

function txRows(txns: Transaction[], limit = 12) {
  return txns.slice(0, limit).map((t) => ({ date: prettyDate(t.date, { year: true }), description: t.ai?.normalizedVendor ?? t.description, account: t.splits?.length ? "Split" : accountName(t.accountId ?? t.ai?.accountId), amount: money(t.amount, { decimals: true }) }));
}

function categorySpend(ctx: Ctx, q: string): AskAnswer {
  const period = parsePeriod(q) ?? { from: `${today().slice(0, 4)}-01-01`, to: today(), label: "this year" };
  const hit = CATEGORY_SYNONYMS.find(([re]) => re.test(q));
  const vendor = findVendor(ctx.org.id, q);
  if (!hit && vendor) return vendorPayments(ctx, vendor, q);
  if (!hit) return financialSummary(ctx);
  const data = ledgerDataFor(ctx.org.id);
  const subs = totalsBySubtype(data, period.from, period.to);
  const accounts = data.accounts.filter((a) => hit[1].includes(a.subtype));
  const expenseAccts = accounts.filter((a) => a.type === "expense");
  const capexAccts = accounts.filter((a) => a.type === "asset");
  const expense = expenseAccts.reduce((s, a) => s + (subs.get(a.subtype) ?? 0), 0);
  const capex = capexAccts.reduce((s, a) => s + (subs.get(a.subtype) ?? 0), 0);
  const priorFrom = `${Number(period.from.slice(0, 4)) - 1}${period.from.slice(4)}`;
  const priorTo = `${Number(period.to.slice(0, 4)) - 1}${period.to.slice(4)}`;
  const priorSubs = totalsBySubtype(data, priorFrom, priorTo);
  const prior = expenseAccts.reduce((s, a) => s + (priorSubs.get(a.subtype) ?? 0), 0);
  const ids = new Set(accounts.map((a) => a.id));
  const txns = data.transactions.filter((t) => t.date >= period.from && t.date <= period.to && t.status !== "excluded" && ((t.accountId && ids.has(t.accountId)) || t.splits?.some((s) => ids.has(s.accountId)))).sort((a, b) => a.amount - b.amount);
  const name = expenseAccts.map((a) => a.name).join(" + ") || accounts[0]?.name || "that category";
  const change = prior ? (expense - prior) / prior : 0;
  const bullets = [`${name}: ${usd(expense)} in operating expenses across ${plural(txns.filter((t) => t.accountId && expenseAccts.some((a) => a.id === t.accountId)).length, "transaction")}.`];
  if (capex) bullets.push(`Plus ${usd(capex)} capitalized as ${capexAccts.map((a) => a.name.toLowerCase()).join(", ")} (balance-sheet purchases, depreciated over time).`);
  if (prior) bullets.push(`That's ${signedPct(change)} vs. the same period last year (${usd(prior)}).`);
  return {
    intent: "books.category_spend",
    modules: ["books", "reports"],
    summary: `You spent ${usd(expense)} on ${name.toLowerCase()} ${period.label}${capex ? `, plus ${usd(capex)} of capital equipment purchases` : ""}.`,
    bullets,
    metrics: [{ label: period.label === "this year" ? "YTD" : period.label, value: moneyCompact(expense) }, ...(prior ? [{ label: "vs. last year", value: signedPct(change), tone: change > 0 ? ("negative" as const) : ("positive" as const) }] : [])],
    table: { caption: "Largest transactions", columns: [{ key: "date", label: "Date" }, { key: "description", label: "Payee" }, { key: "account", label: "Category" }, { key: "amount", label: "Amount", align: "right" }], rows: txRows(txns, 8), href: `/books?account=${expenseAccts[0]?.id ?? ""}&from=${period.from}&to=${period.to}` },
    sources: [sourceAccounting(ctx.org.id), { kind: "accounting", label: "Profit & Loss", detail: `${period.from} to ${period.to}`, href: "/books?tab=reports" }],
    followUps: ["Who are our largest vendors?", "Why did expenses increase in September?"],
    grounding: "grounded",
  };
}

function vendorPayments(ctx: Ctx, vendor: Vendor, q: string): AskAnswer {
  const period = parsePeriod(q);
  const related = db().vendors.filter((v) => v.orgId === ctx.org.id && (v.id === vendor.id || v.name.startsWith(vendor.name.split(" (")[0]!)));
  const ids = new Set(related.map((v) => v.id));
  const txns = db()
    .transactions.filter((t) => t.orgId === ctx.org.id && t.vendorId && ids.has(t.vendorId) && t.status !== "excluded" && (!period || (t.date >= period.from && t.date <= period.to)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const out = txns.filter((t) => t.amount < 0);
  const total = out.reduce((s, t) => s - t.amount, 0);
  const ytd = out.filter((t) => t.date >= `${today().slice(0, 4)}-01-01`).reduce((s, t) => s - t.amount, 0);
  return {
    intent: "books.vendor_payments",
    modules: ["books"],
    summary: `${plural(out.length, "payment")} to ${vendor.name}${period ? ` ${period.label}` : " since records began"} totalling ${usd(total)}${!period ? ` — ${usd(ytd)} of it this year` : ""}.`,
    metrics: [{ label: "Total paid", value: moneyCompact(total) }, { label: "This year", value: moneyCompact(ytd) }, { label: "Payments", value: String(out.length) }],
    table: { caption: `Recent payments to ${vendor.name}`, columns: [{ key: "date", label: "Date" }, { key: "description", label: "Bank description" }, { key: "account", label: "Category" }, { key: "amount", label: "Amount", align: "right" }], rows: out.slice(0, 10).map((t) => ({ date: prettyDate(t.date, { year: true }), description: t.description, account: t.splits?.length ? "Split" : accountName(t.accountId ?? t.ai?.accountId), amount: money(t.amount, { decimals: true }) })), href: `/books?vendor=${vendor.id}` },
    sources: [sourceAccounting(ctx.org.id)],
    followUps: [`Show me the invoice for the ${vendor.name.split(" ")[0]} ${vendor.name.split(" ")[1] ?? ""} purchase.`.replace(/\s+\./, "."), "Who are our largest vendors?"],
    grounding: "grounded",
  };
}

function topVendors(ctx: Ctx, q: string): AskAnswer {
  const period = parsePeriod(q) ?? { from: `${today().slice(0, 4)}-01-01`, to: today(), label: "this year" };
  const by = new Map<string, number>();
  const data = db();
  for (const t of data.transactions) {
    if (t.orgId !== ctx.org.id || t.amount >= 0 || t.status === "excluded" || t.date < period.from || t.date > period.to || !t.vendorId) continue;
    if (t.type === "transfer" || t.type === "owner_draw" || (t.accountId && ["credit_card", "bank"].includes(data.glAccounts.find((a) => a.id === t.accountId)?.subtype ?? ""))) continue;
    by.set(t.vendorId, (by.get(t.vendorId) ?? 0) - t.amount);
  }
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const total = [...by.values()].reduce((s, v) => s + v, 0);
  return {
    intent: "books.top_vendors",
    modules: ["books"],
    summary: `Your largest vendors ${period.label} are ${rows.slice(0, 3).map(([id]) => data.vendors.find((v) => v.id === id)?.name).join(", ")}. The top 10 account for ${Math.round((rows.reduce((s, [, v]) => s + v, 0) / total) * 100)}% of vendor payments.`,
    table: { columns: [{ key: "vendor", label: "Vendor" }, { key: "share", label: "Share", align: "right" }, { key: "amount", label: "Paid", align: "right" }], rows: rows.map(([id, v]) => ({ vendor: data.vendors.find((x) => x.id === id)?.name ?? id, share: `${((v / total) * 100).toFixed(1)}%`, amount: usd(v) })), href: "/books" },
    sources: [sourceAccounting(ctx.org.id)],
    followUps: ["Show me payments to John Deere.", "How much did we spend on fuel this year?"],
    grounding: "grounded",
  };
}

function variance(ctx: Ctx, a: { from: ISODate; to: ISODate }, b: { from: ISODate; to: ISODate }) {
  const data = ledgerDataFor(ctx.org.id);
  const cur = totalsBySubtype(data, a.from, a.to);
  const prev = totalsBySubtype(data, b.from, b.to);
  const rows = Object.keys(SUBTYPES)
    .filter((s) => ["income", "expense"].includes(subtypeMeta(s).type))
    .map((s) => ({ sub: s, type: subtypeMeta(s).type, name: data.accounts.find((x) => x.subtype === s)?.name ?? subtypeMeta(s).name, cur: cur.get(s) ?? 0, prev: prev.get(s) ?? 0 }))
    .filter((r) => r.cur || r.prev)
    .map((r) => ({ ...r, delta: r.cur - r.prev }));
  const sum = (t: string, k: "cur" | "prev") => rows.filter((r) => r.type === t).reduce((s, r) => s + r[k], 0);
  return { rows, revCur: sum("income", "cur"), revPrev: sum("income", "prev"), expCur: sum("expense", "cur"), expPrev: sum("expense", "prev") };
}

function expenseVariance(ctx: Ctx, q: string): AskAnswer {
  const p = parsePeriod(q) ?? { from: `${addMonths(periodOf(today()), -1)}-01`, to: monthEnd(addMonths(periodOf(today()), -1)), label: monthName(addMonths(periodOf(today()), -1)) };
  const period = p.from.slice(0, 7);
  const prior = addMonths(period, -1);
  const v = variance(ctx, { from: p.from, to: p.to }, { from: `${prior}-01`, to: monthEnd(prior) });
  const exp = v.rows.filter((r) => r.type === "expense").sort((a, b) => b.delta - a.delta);
  const delta = v.expCur - v.expPrev;
  const drivers = exp.filter((r) => r.delta > 0).slice(0, 4);
  return {
    intent: "books.expense_variance",
    modules: ["books", "reports"],
    summary:
      delta > 0
        ? `Expenses rose ${usd(delta)} (${signedPct(v.expPrev ? delta / v.expPrev : 0)}) in ${p.label} compared with ${monthName(prior)}. The main driver was ${drivers[0]?.name} (+${usd(drivers[0]?.delta ?? 0)})${drivers[0]?.sub === "cash_rent" ? " — the second-half cash rent installments to your four landlords are paid each September" : ""}.`
        : `Expenses didn't increase in ${p.label} — they were ${usd(-delta)} lower than ${monthName(prior)}.`,
    bullets: drivers.map((d) => `${d.name}: ${usd(d.prev)} → ${usd(d.cur)} (${d.delta > 0 ? "+" : ""}${usd(d.delta)})`),
    table: { caption: "Largest changes by account", columns: [{ key: "account", label: "Account" }, { key: "prev", label: monthName(prior), align: "right" }, { key: "cur", label: monthName(period), align: "right" }, { key: "delta", label: "Change", align: "right" }], rows: exp.slice(0, 8).map((r) => ({ account: r.name, prev: usd(r.prev), cur: usd(r.cur), delta: money(r.delta, { sign: true }) })), href: "/books?tab=reports" },
    sources: [sourceAccounting(ctx.org.id), { kind: "accounting", label: "Profit & Loss by month", detail: `${monthName(prior)} vs ${monthName(period)}`, href: "/books?tab=reports" }],
    followUps: ["Why did profit decline last quarter?", "Who are our largest vendors?"],
    grounding: "grounded",
  };
}

function profitVariance(ctx: Ctx): AskAnswer {
  const { year, q: qq } = quarterOf(today());
  const last = qq === 1 ? { year: year - 1, q: 4 } : { year, q: qq - 1 };
  const prev = last.q === 1 ? { year: last.year - 1, q: 4 } : { year: last.year, q: last.q - 1 };
  const a = quarterRange(last.year, last.q);
  const b = quarterRange(prev.year, prev.q);
  const yoy = quarterRange(last.year - 1, last.q);
  const v = variance(ctx, a, b);
  const vy = variance(ctx, a, yoy);
  const profit = v.revCur - v.expCur;
  const prevProfit = v.revPrev - v.expPrev;
  const yoyProfit = vy.revPrev - vy.expPrev;
  const declined = profit < prevProfit;
  const drivers = v.rows.map((r) => ({ ...r, impact: r.type === "income" ? r.delta : -r.delta })).sort((x, y) => x.impact - y.impact);
  const neg = drivers.filter((d) => d.impact < 0).slice(0, 3);
  const pos = drivers.filter((d) => d.impact > 0).reverse().slice(0, 2);
  const lq = `Q${last.q} ${last.year}`;
  return {
    intent: "cfo.profit_variance",
    modules: ["books", "cfo"],
    summary: declined
      ? `Profit fell from ${usd(prevProfit)} in Q${prev.q} to ${usd(profit)} in ${lq} (${money(profit - prevProfit, { sign: true })}). The biggest pressures were ${neg.map((d) => `${d.name.toLowerCase()} (${money(d.impact, { sign: true })})`).join(", ")}.`
      : `Profit didn't decline last quarter: ${lq} net income was ${usd(profit)}, up ${usd(profit - prevProfit)} from Q${prev.q} (${usd(prevProfit)}). Compared with ${lq.replace(String(last.year), String(last.year - 1))}, it was ${profit >= yoyProfit ? "up" : "down"} ${usd(Math.abs(profit - yoyProfit))}. The largest offsets were ${neg.map((d) => `${d.name.toLowerCase()} (${money(d.impact, { sign: true })})`).join(", ")}.`,
    bullets: [...pos.map((d) => `Helped: ${d.name} ${money(d.impact, { sign: true })}`), ...neg.map((d) => `Hurt: ${d.name} ${money(d.impact, { sign: true })}`)],
    metrics: [{ label: `Q${prev.q} profit`, value: moneyCompact(prevProfit) }, { label: `${lq} profit`, value: moneyCompact(profit), tone: declined ? "negative" : "positive" }],
    table: { caption: `Profit drivers, ${lq} vs Q${prev.q}`, columns: [{ key: "account", label: "Account" }, { key: "impact", label: "Profit impact", align: "right" }], rows: [...neg, ...pos].map((d) => ({ account: d.name, impact: money(d.impact, { sign: true }) })), href: "/books?tab=reports" },
    sources: [sourceAccounting(ctx.org.id), { kind: "accounting", label: "Profit & Loss by quarter", href: "/books?tab=reports" }],
    followUps: ["Compare revenue with last quarter.", "Why did expenses increase in September?"],
    grounding: "grounded",
  };
}

function revenueCompare(ctx: Ctx): AskAnswer {
  const { year, q } = quarterOf(today());
  const last = q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
  const prev = last.q === 1 ? { year: last.year - 1, q: 4 } : { year: last.year, q: last.q - 1 };
  const v = variance(ctx, quarterRange(last.year, last.q), quarterRange(prev.year, prev.q));
  const inc = v.rows.filter((r) => r.type === "income").sort((a, b) => b.cur - a.cur);
  return {
    intent: "books.revenue_compare",
    modules: ["books", "reports"],
    summary: `Revenue was ${usd(v.revCur)} in Q${last.q} ${last.year} vs ${usd(v.revPrev)} in Q${prev.q} (${signedPct(v.revPrev ? (v.revCur - v.revPrev) / v.revPrev : 0)}).`,
    table: { columns: [{ key: "account", label: "Revenue account" }, { key: "prev", label: `Q${prev.q}`, align: "right" }, { key: "cur", label: `Q${last.q}`, align: "right" }], rows: inc.map((r) => ({ account: r.name, prev: usd(r.prev), cur: usd(r.cur) })), href: "/books?tab=reports" },
    sources: [sourceAccounting(ctx.org.id)],
    followUps: ["Why did profit decline last quarter?"],
    grounding: "grounded",
  };
}

function financialSummary(ctx: Ctx): AskAnswer {
  const k = getKpis(ctx.org.id);
  return {
    intent: "books.summary",
    modules: ["books", "reports"],
    summary: `Year to date: revenue ${usd(k.revenueYtd)}, expenses ${usd(k.expensesYtd)}, net income ${usd(k.netIncomeYtd)} (${(k.operatingMargin * 100).toFixed(1)}% margin). Revenue is ${signedPct(k.revenueYtdPrior ? (k.revenueYtd - k.revenueYtdPrior) / k.revenueYtdPrior : 0)} vs. last year.`,
    metrics: [{ label: "Revenue YTD", value: moneyCompact(k.revenueYtd) }, { label: "Expenses YTD", value: moneyCompact(k.expensesYtd) }, { label: "Net income", value: moneyCompact(k.netIncomeYtd) }],
    links: [{ label: "Open Profit & Loss", href: "/books?tab=reports" }],
    sources: [sourceAccounting(ctx.org.id)],
    followUps: ["Why did profit decline last quarter?", "What is our current cash position?"],
    grounding: "grounded",
  };
}

function booksStatus(ctx: Ctx): AskAnswer {
  const c = currentClose(ctx.org.id);
  return {
    intent: "books.close_status",
    modules: ["books"],
    summary: `${periodLabel(c.cp.period)} books are ${c.pct}% complete${c.cp.status === "closed" ? " and closed" : ""}. ${c.tasks.filter((t) => t.state !== "done").map((t) => t.label).join(", ") || "Nothing outstanding"}${c.cp.status === "closed" ? "" : " remaining"}.`,
    table: { columns: [{ key: "task", label: "Step" }, { key: "state", label: "Status" }], rows: c.tasks.map((t) => ({ task: t.label, state: t.state === "done" ? "Done" : t.state === "in_progress" ? "In progress" : "Not started" })), href: "/close" },
    sources: [{ kind: "accounting", label: "Monthly close", href: "/close" }],
    grounding: "grounded",
  };
}

// ─── Bills / Collect ────────────────────────────────────────────────────────

function billsDue(ctx: Ctx, q: string): AskAnswer {
  const d = today();
  const week = /week/.test(q);
  const end = week ? addDays(d, 6) : monthEnd(periodOf(d));
  const vendors = new Map(db().vendors.map((v) => [v.id, v.name]));
  const bills = openBills(ctx.org.id).filter((b) => b.dueDate <= end).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = bills.filter((b) => b.dueDate < d);
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return {
    intent: "bills.due",
    modules: ["bills"],
    summary: `${plural(bills.length, "bill")} totalling ${usd(total)} ${bills.length === 1 ? "is" : "are"} due by ${prettyDate(end)}${overdue.length ? `, including ${usd(overdue.reduce((s, b) => s + b.amount, 0))} already overdue` : ""}.`,
    metrics: [{ label: week ? "Due this week" : "Due this month", value: moneyCompact(total) }, { label: "Overdue", value: moneyCompact(overdue.reduce((s, b) => s + b.amount, 0)), tone: overdue.length ? "negative" : "neutral" }],
    table: { columns: [{ key: "vendor", label: "Vendor" }, { key: "number", label: "Bill #" }, { key: "due", label: "Due" }, { key: "status", label: "Status" }, { key: "amount", label: "Amount", align: "right" }], rows: bills.map((b) => ({ vendor: vendors.get(b.vendorId) ?? "", number: b.number, due: prettyDate(b.dueDate), status: b.dueDate < d ? "Overdue" : b.status.replace("_", " "), amount: usd(b.amount) })), href: "/bills" },
    sources: [sourceAccounting(ctx.org.id), { kind: "accounting", label: "Bills", href: "/bills" }],
    followUps: ["What is our current cash position?"],
    grounding: "grounded",
  };
}

function whoOwes(ctx: Ctx, q: string): AskAnswer {
  const min = (parseAmount(q) ?? 0) * 100;
  const by = new Map<string, { open: number; oldest: number; count: number }>();
  for (const i of openReceivables(ctx.org.id)) {
    const e = by.get(i.customerId) ?? { open: 0, oldest: 0, count: 0 };
    e.open += i.open;
    e.oldest = Math.max(e.oldest, i.daysOverdue);
    e.count++;
    by.set(i.customerId, e);
  }
  const customers = new Map(db().customers.map((c) => [c.id, c.name]));
  const rows = [...by.entries()].filter(([, e]) => e.open > min).sort((a, b) => b[1].open - a[1].open);
  const aging = arAging(ctx.org.id);
  return {
    intent: "collect.who_owes",
    modules: ["collect"],
    summary: rows.length ? `${plural(rows.length, "customer")} owe${rows.length === 1 ? "s" : ""} you ${min ? `more than ${usd(min)}` : "money"}: ${rows.map(([id, e]) => `${customers.get(id)} (${usd(e.open)})`).join(", ")}.` : `No customer owes more than ${usd(min)}.`,
    metrics: [{ label: "Outstanding AR", value: moneyCompact(aging.current + aging.d1_30 + aging.d31_60 + aging.d60plus) }, { label: "Over 30 days", value: moneyCompact(aging.d31_60 + aging.d60plus), tone: "negative" }],
    table: { columns: [{ key: "customer", label: "Customer" }, { key: "invoices", label: "Invoices", align: "right" }, { key: "oldest", label: "Most overdue", align: "right" }, { key: "open", label: "Outstanding", align: "right" }], rows: rows.map(([id, e]) => ({ customer: customers.get(id) ?? id, invoices: String(e.count), oldest: e.oldest ? `${e.oldest} days` : "Current", open: usd(e.open) })), href: "/collect" },
    sources: [sourceAccounting(ctx.org.id), { kind: "accounting", label: "AR aging", href: "/collect" }],
    followUps: ["Which bills are due this month?"],
    grounding: "grounded",
  };
}

// ─── CFO ────────────────────────────────────────────────────────────────────

function cashPosition(ctx: Ctx): AskAnswer {
  const data = ledgerDataFor(ctx.org.id);
  const k = getKpis(ctx.org.id);
  const f = getForecast(ctx.org.id);
  const bal = balances(buildPostings(data), today());
  const rows = data.bankAccounts.filter((b) => b.kind !== "credit_card").map((b) => ({ account: `${b.name} ••••${b.mask}`, balance: usd(bal.get(b.glAccountId) ?? 0) }));
  return {
    intent: "cfo.cash_position",
    modules: ["cfo", "books"],
    summary: `You have ${usd(k.cash)} in cash across ${plural(rows.length, "account")}. Over the next 13 weeks the forecast low point is ${moneyCompact(f.minCash)} (week ${f.minWeek}) and cash ends near ${moneyCompact(f.endingCash)}, ${f.weeksBelowBuffer.length ? `dipping below your ${moneyCompact(f.bufferCents)} buffer in ${f.weeksBelowBuffer.length} weeks` : `staying above your ${moneyCompact(f.bufferCents)} buffer`}.`,
    metrics: [{ label: "Cash today", value: moneyCompact(k.cash) }, { label: "13-week low", value: moneyCompact(f.minCash) }, { label: "Week 13", value: moneyCompact(f.endingCash) }],
    table: { columns: [{ key: "account", label: "Account" }, { key: "balance", label: "Balance", align: "right" }], rows, href: "/cfo?tab=forecast" },
    sources: [sourceAccounting(ctx.org.id), { kind: "forecast", label: "13-week cash forecast", detail: "Known + estimated flows", href: "/cfo?tab=forecast" }],
    followUps: ["Can we afford to purchase another $1 million of farmland?", "Which bills are due this month?"],
    grounding: "grounded",
  };
}

function forecastAnswer(ctx: Ctx): AskAnswer {
  const f = getForecast(ctx.org.id);
  return {
    intent: "cfo.forecast",
    modules: ["cfo"],
    summary: `Starting from ${moneyCompact(f.startingCash)}, cash is projected at ${moneyCompact(f.endingCash)} by week 13. Known inflows total ${moneyCompact(f.totals.inKnown)} and known outflows ${moneyCompact(f.totals.outKnown)}; the rest is estimated from last year's seasonality.`,
    table: { columns: [{ key: "week", label: "Week" }, { key: "close", label: "Projected cash", align: "right" }], rows: f.weeks.map((w) => ({ week: `Week ${w.index} · ${w.label}`, close: moneyCompact(w.closing) })), href: "/cfo?tab=forecast" },
    sources: [{ kind: "forecast", label: "13-week cash forecast", href: "/cfo?tab=forecast" }, sourceAccounting(ctx.org.id)],
    grounding: "grounded",
  };
}

function affordability(ctx: Ctx, q: string): AskAnswer {
  const amount = parseAmount(q);
  const type = /land|acre|farm ?land|property/.test(q) ? "land_purchase" : /hire|employee|staff/.test(q) ? "hire_employees" : "equipment_purchase";
  const inputs = type === "hire_employees" ? { ...SCENARIO_DEFAULTS.hire_employees, count: amount && amount < 50 ? amount : 3 } : { ...SCENARIO_DEFAULTS[type], price: amount ?? SCENARIO_DEFAULTS[type].price };
  const base = forecastInput(ctx.org.id).input;
  const r = runScenario(type, inputs, base, scenarioBaseline(ctx.org.id));
  const params = new URLSearchParams({ tab: "scenarios", type, ...Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(v)])) });
  return {
    intent: `cfo.scenario.${type}`,
    modules: ["cfo", "books"],
    summary: r.verdict.headline,
    bullets: r.verdict.points,
    metrics: [
      { label: "Cash after (week 13)", value: moneyCompact(r.scenario.cashWeek13), tone: r.scenario.cashWeek13 < r.baseline.cashWeek13 ? "negative" : "neutral" },
      { label: "Debt-to-assets", value: `${(r.scenario.debtToAssets * 100).toFixed(0)}%` },
      { label: "Debt service coverage", value: r.scenario.dscr ? `${r.scenario.dscr.toFixed(2)}×` : "—" },
    ],
    table: { caption: "Assumptions used", columns: [{ key: "a", label: "Assumption" }, { key: "v", label: "Value" }], rows: r.assumptions.map((a) => ({ a: a.label, v: a.value })), href: `/cfo?${params}` },
    links: [{ label: "Open this scenario in CFO", href: `/cfo?${params}` }],
    sources: [sourceAccounting(ctx.org.id), { kind: "forecast", label: "13-week cash forecast" }, { kind: "scenario", label: `Scenario: ${r.title}`, detail: "Edit the assumptions in CFO", href: `/cfo?${params}` }],
    followUps: ["What government programs could potentially help Smith Family Farms expand?", "What is our current cash position?"],
    grounding: "grounded",
  };
}

// ─── Funding & documents ───────────────────────────────────────────────────

function fundingPrograms(ctx: Ctx, q: string, thread: AskThread): AskAnswer {
  let tags: PurposeTag[] | undefined;
  if (/expan|grow|land|acre/.test(q)) tags = ["land_purchase", "expansion", "equipment", "storage", "energy"];
  else if (/equipment|machinery|tractor|combine|planter/.test(q)) tags = ["equipment", "storage", "energy"];
  else if (/conservation|cover crop|water|soil/.test(q)) tags = ["conservation", "water_quality"];
  else if (/energy|solar|dryer/.test(q)) tags = ["energy", "storage"];
  else if (/disaster|drought|flood|storm/.test(q)) tags = ["disaster"];
  const all = fundingMatches(ctx.org.id).filter((m) => m.match.level !== "unlikely");
  const list = tags ? all.filter((m) => m.program.purposeTags.some((t) => tags!.includes(t))) : all;
  thread.context.lastProgramIds = list.map((m) => m.program.id);
  const labels = { high: "High potential", possible: "Possible", more_info: "More info needed", unlikely: "Unlikely" };
  const purpose = tags ? (tags.includes("land_purchase") ? "expansion" : tags.includes("equipment") ? "equipment purchases" : tags[0]!.replace("_", " ")) : "your operation";
  return {
    intent: "funding.programs",
    modules: ["funding"],
    summary: `Fabrik found ${plural(list.length, "program")} that could potentially help with ${purpose}${list.length ? `. Strongest: ${list.slice(0, 2).map((m) => m.program.name).join(" and ")}` : ""}. These are potential matches based on your farm profile — eligibility is only confirmed by the agency or lender.`,
    bullets: list.slice(0, 5).map((m) => `${m.program.name} (${m.program.agency}) — ${labels[m.match.level]}: ${m.match.qualifying.find((q) => q.includes("—")) ?? m.match.qualifying[0] ?? m.match.explanation}`),
    table: { columns: [{ key: "program", label: "Program" }, { key: "type", label: "Type" }, { key: "match", label: "Match" }, { key: "score", label: "Score", align: "right" }], rows: list.map((m) => ({ program: m.program.name, type: m.program.programType.replace(/_/g, " "), match: labels[m.match.level], score: `${m.match.score}%` })), href: "/funding" },
    links: list.slice(0, 3).map((m) => ({ label: m.program.name, href: `/funding/${m.program.id}` })),
    sources: [{ kind: "profile", label: "Farm / business profile", href: "/funding/profile" }, ...list.slice(0, 4).map((m) => ({ kind: "program" as const, label: `${m.program.agency}`, detail: m.program.lastVerified ? `Verified ${m.program.lastVerified}` : "Verification pending", href: m.program.officialSourceUrl }))],
    followUps: ["What documents do we already have for these applications?", "Can we afford to purchase another $1 million of farmland?"],
    grounding: "grounded",
  };
}

function fundingDocuments(ctx: Ctx, thread: AskThread): AskAnswer {
  const all = fundingMatches(ctx.org.id);
  const ids = thread.context.lastProgramIds?.length ? thread.context.lastProgramIds : all.filter((m) => m.match.level === "high" || m.match.level === "possible").map((m) => m.program.id);
  const programs = all.filter((m) => ids.includes(m.program.id));
  const profile = getProfile(ctx.org.id);
  const rctx = readinessContext(ctx.org.id);
  const docs = db().documents.filter((d) => d.orgId === ctx.org.id && d.tags.some((t) => t.startsWith("funding:")));
  const reads = programs.map((m) => ({ m, r: readiness(m.program, profile, rctx) }));
  const acres = (profile.acresOwned ?? 0) + (profile.acresRented ?? 0);
  const profileParts = [
    "entity",
    profile.owners.length ? `ownership (${profile.owners.map((o) => o.pct).join("/")})` : undefined,
    acres ? `${acres.toLocaleString("en-US")} acres` : undefined,
    profile.crops.length ? "crops" : undefined,
    profile.equipment.length ? "equipment" : undefined,
  ].filter(Boolean) as string[];
  const have = [
    ...(rctx.booksClosedThrough ? [`Profit & Loss, Balance Sheet and Cash Flow (books closed through ${periodLabel(rctx.booksClosedThrough)})`] : []),
    ...docs.map((d) => d.filename.replace(/_/g, " ").replace(/\.pdf$/i, "")),
    `Farm profile: ${profileParts.length > 1 ? `${profileParts.slice(0, -1).join(", ")} and ${profileParts.at(-1)}` : profileParts[0]}`,
  ];
  const missing = [...new Set(reads.flatMap(({ r }) => r.items.filter((i) => !i.done).map((i) => (i.key === "additional" ? i.detail : i.label))))];
  return {
    intent: "funding.documents",
    modules: ["funding", "documents", "books"],
    summary: `For ${plural(programs.length, "program")} you're looking at, you already have ${have.length} key items ready — your financial statements come straight from your closed books. Still missing: ${missing.slice(0, 4).join("; ").toLowerCase()}.`,
    bullets: [...have.map((h) => `✓ ${h}`), ...missing.map((m) => `○ ${m}`)],
    table: { caption: "Application readiness", columns: [{ key: "program", label: "Program" }, { key: "ready", label: "Ready", align: "right" }, { key: "next", label: "Next step" }], rows: reads.map(({ m, r }) => ({ program: m.program.name, ready: `${r.pct}%`, next: r.items.find((i) => !i.done)?.label ?? "Ready to contact agency" })), href: "/funding" },
    links: [{ label: "Upload documents", href: "/documents" }, { label: "Complete farm profile", href: "/funding/profile" }],
    sources: [{ kind: "document", label: "Documents", detail: `${docs.length} funding-tagged files`, href: "/documents" }, sourceAccounting(ctx.org.id), { kind: "profile", label: "Farm / business profile", href: "/funding/profile" }],
    followUps: ["Can we afford to purchase another $1 million of farmland?"],
    grounding: "grounded",
  };
}

function findDocument(ctx: Ctx, q: string): AskAnswer {
  const vendor = findVendor(ctx.org.id, q);
  const term = vendor?.name.split(" (")[0]!.toLowerCase();
  const docs = db()
    .documents.filter((d) => d.orgId === ctx.org.id && (d.kind === "invoice" || d.kind === "receipt"))
    .filter((d) => (term ? similarity(d.extraction?.vendor ?? d.filename, term) > 0.3 || d.filename.toLowerCase().includes(term.split(" ")[0]!) : true))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const open = db().inbox.find((i) => i.orgId === ctx.org.id && i.status === "open" && i.type === "missing_document" && (!term || i.title.toLowerCase().includes(term.split(" ")[0]!)));
  if (!docs.length) {
    return {
      intent: "documents.find",
      modules: ["documents"],
      summary: `I couldn't find ${term ? `a ${vendor!.name} ` : "an "}invoice in your documents yet.${open ? ` Fabrik has already asked for it: “${open.title}”. Upload it and Fabrik will match it to the transaction automatically.` : ""}`,
      links: [{ label: "Upload in Documents", href: "/documents" }, ...(open ? [{ label: "Open the request", href: "/inbox" }] : [])],
      sources: [{ kind: "document", label: "Documents", href: "/documents" }],
      grounding: "partial",
    };
  }
  const d = docs[0]!;
  const t = d.match?.transactionId ? db().transactions.find((x) => x.id === d.match!.transactionId) : undefined;
  return {
    intent: "documents.find",
    modules: ["documents", "books"],
    summary: `Here's ${d.extraction?.vendor ?? "the"} ${d.kind} ${d.extraction?.documentNumber ?? d.filename} for ${d.extraction?.total != null ? money(d.extraction.total, { decimals: true }) : "an unknown amount"}${d.extraction?.documentDate ? `, dated ${prettyDate(d.extraction.documentDate, { year: true })}` : ""}.${t ? ` It's matched to the ${money(t.amount, { decimals: true })} payment on ${prettyDate(t.date)}.` : ""}`,
    table: { columns: [{ key: "file", label: "Document" }, { key: "number", label: "Number" }, { key: "date", label: "Date" }, { key: "total", label: "Total", align: "right" }], rows: docs.slice(0, 5).map((x) => ({ file: x.filename, number: x.extraction?.documentNumber ?? "—", date: x.extraction?.documentDate ? prettyDate(x.extraction.documentDate) : "—", total: x.extraction?.total != null ? money(x.extraction.total, { decimals: true }) : "—" })), href: `/documents?doc=${d.id}` },
    links: [{ label: "Open document", href: `/documents?doc=${d.id}` }, ...(t ? [{ label: "Open transaction", href: `/books?txn=${t.id}` }] : [])],
    sources: [{ kind: "document", label: d.filename, detail: `Extracted by ${d.extraction?.provider ?? "FabrikIDP"}`, href: `/documents?doc=${d.id}` }],
    grounding: "grounded",
  };
}

export function threadsFor(ctx: Ctx) {
  return db()
    .askThreads.filter((t) => t.orgId === ctx.org.id && t.userId === ctx.user.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
