import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { requireCtx, hasPerm } from "@/server/auth/session";
import { db } from "@/server/db/store";
import { listTransactions, accountName, type TxnFilters } from "@/server/services/transactions";
import { buildReport, normalizeParams } from "@/server/services/reports";
import { PageHeader, Card, Badge, LinkButton, buttonClass } from "@/components/ui/primitives";
import { TxnTable, type TxnRow } from "@/components/books/txn-table";
import { TxnFiltersBar } from "@/components/books/filters";
import { ReportTable, ReportControls } from "@/components/books/report";
import { cn } from "@/lib/cn";
import { prettyDateTime } from "@/lib/dates";

export const metadata = { title: "Books" };

type SP = Record<string, string | undefined>;

export default async function BooksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const tab = sp.tab === "reports" ? "reports" : sp.tab === "rules" ? "rules" : "transactions";
  const conn = db().connections.find((c) => c.orgId === ctx.org.id && c.provider === "quickbooks_online");
  const tabs = [
    { key: "transactions", label: "Transactions" },
    { key: "reports", label: "Reports" },
    { key: "rules", label: "AI rules" },
  ];
  return (
    <div>
      <PageHeader
        title="Books"
        description="Every transaction from QuickBooks Online, categorized by Fabrik AI. High-confidence, low-risk items are processed automatically; everything else is reviewed by a person."
        badge={<Badge tone="neutral">QuickBooks Online · synced {conn?.lastSyncAt ? prettyDateTime(conn.lastSyncAt) : "—"} UTC</Badge>}
      />
      <div className="flex items-center gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <Link key={t.key} href={`/books${t.key === "transactions" ? "" : `?tab=${t.key}`}`} role="tab" aria-selected={tab === t.key} className={cn("relative px-3 h-10 inline-flex items-center text-[13.5px] font-medium", tab === t.key ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-brand-600 after:rounded" : "text-muted hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "transactions" && <TransactionsTab sp={sp} />}
      {tab === "reports" && <ReportsTab sp={sp} />}
      {tab === "rules" && <RulesTab />}
    </div>
  );

  async function TransactionsTab({ sp }: { sp: SP }) {
    const f: TxnFilters = {
      q: sp.q,
      from: sp.from,
      to: sp.to,
      bankAccountId: sp.bank,
      accountId: sp.account,
      status: sp.status,
      vendorId: sp.vendor,
      minAmount: sp.min ? Number(sp.min) : undefined,
      maxAmount: sp.max ? Number(sp.max) : undefined,
      confidence: sp.confidence as TxnFilters["confidence"],
      page: sp.page ? Number(sp.page) : 1,
    };
    const res = listTransactions(ctx, f);
    const data = db();
    const banks = data.bankAccounts.filter((b) => b.orgId === ctx.org.id);
    const bankName = new Map(banks.map((b) => [b.id, `${b.name} ••••${b.mask}`]));
    const accounts = data.glAccounts.filter((a) => a.orgId === ctx.org.id && (a.type === "expense" || a.type === "income")).map((a) => ({ id: a.id, name: a.name }));
    const vendors = data.vendors.filter((v) => v.orgId === ctx.org.id).map((v) => ({ id: v.id, name: v.name })).sort((a, b) => a.name.localeCompare(b.name));
    const rows: TxnRow[] = res.rows.map((t) => ({
      id: t.id,
      date: t.date,
      vendor: t.ai?.normalizedVendor ?? t.description,
      description: t.description,
      amount: t.amount,
      bank: bankName.get(t.bankAccountId) ?? "",
      category: t.splits?.length ? "Split" : accountName(t.accountId ?? t.ai?.accountId),
      suggested: !t.accountId && !t.splits?.length,
      confidence: t.ai?.confidence ?? 0,
      status: t.status,
      hasDoc: t.documentIds.length > 0,
      risk: t.risk?.reasons.map((r) => r.label) ?? [],
    }));
    return (
      <div className="space-y-4">
        <TxnFiltersBar banks={banks.map((b) => ({ id: b.id, name: `${b.name} ••••${b.mask}` }))} accounts={accounts} vendors={vendors} counts={res.statusCounts} />
        <Card className="overflow-hidden">
          <TxnTable rows={rows} total={res.total} page={res.page} pageSize={res.pageSize} thresholds={ctx.org.thresholds} openId={sp.txn} canReview={hasPerm(ctx, "transactions:review")} canAskClient={hasPerm(ctx, "inbox:ask_client")} />
        </Card>
      </div>
    );
  }

  async function ReportsTab({ sp }: { sp: SP }) {
    const p = normalizeParams(sp);
    const report = await buildReport(ctx.org.id, p);
    const qs = new URLSearchParams(Object.entries({ kind: p.kind, view: p.view, year: String(p.year), asOf: p.asOf, from: p.from, to: p.to }).filter(([, v]) => v) as [string, string][]);
    const canExport = hasPerm(ctx, "reports:export");
    return (
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <ReportControls p={{ kind: p.kind, view: p.view!, year: p.year!, asOf: p.asOf!, from: p.from!, to: p.to! }} />
          {canExport && (
            <div className="flex gap-2">
              <a href={`/api/v1/reports/export?${qs}&format=pdf`} className={buttonClass("secondary", "md")}><Download className="size-4" /> PDF</a>
              <a href={`/api/v1/reports/export?${qs}&format=xlsx`} className={buttonClass("secondary", "md")}><FileSpreadsheet className="size-4" /> Excel</a>
            </div>
          )}
        </div>
        <Card className="overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line">
            <div>
              <div className="text-[13px] text-muted">{ctx.org.legalName}</div>
              <h2 className="text-[18px] font-semibold">{report.title}</h2>
              <div className="text-[12.5px] text-muted">{report.subtitle} · Accrual basis</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {report.checks.map((c) => (
                <Badge key={c.label} tone={c.ok ? "ok" : "crit"}>{c.ok ? "✓" : "!"} {c.label}</Badge>
              ))}
              <Badge tone="neutral">Source: QuickBooks Online</Badge>
            </div>
          </div>
          <ReportTable report={report} />
        </Card>
        <p className="text-[12px] text-subtle">Reports come from the accounting system of record; Fabrik doesn&apos;t keep a parallel ledger. Items still awaiting review appear under Uncategorized until approved.</p>
      </div>
    );
  }

  async function RulesTab() {
    const rules = db().rules.filter((r) => r.orgId === ctx.org.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return (
      <Card>
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">What Fabrik has learned about {ctx.org.name}</h2>
          <p className="text-[13px] text-muted mt-0.5">When someone corrects a category, Fabrik remembers it for this organization so the next similar transaction is processed with much higher confidence.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[12px] text-muted font-medium text-left border-t border-line">
                <th className="px-5 py-2 font-medium">Rule</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Learned from</th>
                <th className="px-3 py-2 font-medium text-right">Applied</th>
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-5 py-2.5 font-medium">{r.label}</td>
                  <td className="px-3 py-2.5 capitalize text-ink-2">{r.kind}</td>
                  <td className="px-3 py-2.5 text-muted">{r.createdFrom === "correction" ? "A correction" : "Manual"} · {r.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{r.hits}×</td>
                  <td className="px-5 py-2.5"><Badge tone={r.active ? "ok" : "neutral"}>{r.active ? "Active" : "Off"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-line text-[12.5px] text-muted">Rule types: organization · vendor · amount · description · recurring. Manage in <LinkButton href="/settings?tab=ai" variant="ghost" size="sm">Team &amp; Settings → AI</LinkButton></div>
      </Card>
    );
  }
}
