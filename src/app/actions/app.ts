"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ClientRole, CloseFrequency, DocumentKind, FarmProfile, FundingWatch, ID, Organization, ScenarioType, StaffRole, TaxDocumentRequest, WorkItem } from "@/lib/types";
import { run } from "@/server/action";
import * as tx from "@/server/services/transactions";
import * as wf from "@/server/services/workflow";
import * as docs from "@/server/services/documents";
import * as close from "@/server/services/close";
import * as funding from "@/server/services/funding";
import * as integ from "@/server/services/integrations";
import * as ops from "@/server/services/ops";
import * as admin from "@/server/services/admin";
import { askQuestion } from "@/server/services/ask";
import { markRead } from "@/server/services/notifications";
import { forecastInput, scenarioBaseline } from "@/server/services/finance";
import { runScenario, type ScenarioInputs } from "@/server/engines/scenarios";
import { commit, db } from "@/server/db/store";
import { newId } from "@/server/db/ids";
import { getCtx } from "@/server/auth/session";

const refresh = () => revalidatePath("/", "layout");
async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

// ─── Transactions & review ──────────────────────────────────────────────────

export async function approveTxn(id: ID, input: tx.ApproveInput = {}) {
  const r = await run("transactions:review", (ctx) => tx.approveTransaction(ctx, id, input), (d) => (d.rule ? `Approved — Fabrik learned “${d.rule.label}”${d.autoProcessed ? ` and auto-categorized ${d.autoProcessed} more` : ""}` : "Approved and written back to QuickBooks"));
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function bulkApproveTxns(ids: ID[], humanSeconds?: number) {
  const r = await run("transactions:bulk_approve", (ctx) => tx.bulkApprove(ctx, ids, humanSeconds), (d) => `Approved ${d.approved} transaction${d.approved === 1 ? "" : "s"}${d.skipped.length ? ` · ${d.skipped.length} need a decision first` : ""}`);
  refresh();
  return r;
}

export async function askClientAboutTxn(id: ID, body?: string, humanSeconds?: number) {
  const r = await run("inbox:ask_client", (ctx) => tx.askClient(ctx, id, { body, humanSeconds }), "Question sent to the client's Finance Inbox");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function draftQuestion(id: ID) {
  return run("inbox:ask_client", (ctx) => tx.draftClientQuestion(tx.getTxn(ctx, id)).body);
}

export async function escalateTxn(id: ID, note: string) {
  const r = await run("transactions:review", (ctx) => tx.escalate(ctx, id, note), "Escalated to the reviewer");
  refresh();
  return r;
}

export async function excludeTxn(id: ID, reason: string) {
  const r = await run("transactions:review", (ctx) => tx.excludeTransaction(ctx, id, reason), "Transaction excluded");
  refresh();
  return r;
}

export async function txnDetail(id: ID) {
  return run("transactions:read", (ctx) => {
    const d = tx.transactionDetail(ctx, id);
    const accounts = db().glAccounts.filter((a) => a.orgId === ctx.org.id && a.active).map((a) => ({ id: a.id, name: a.name, type: a.type, code: a.code }));
    return {
      ...d,
      accountName: tx.accountName(d.txn.accountId),
      suggestedName: tx.accountName(d.txn.ai?.accountId),
      splitNames: (d.txn.splits ?? []).map((s) => ({ ...s, name: tx.accountName(s.accountId) })),
      accounts,
      thresholds: ctx.org.thresholds,
      reviewerName: d.txn.reviewedBy ? db().users.find((u) => u.id === d.txn.reviewedBy)?.name : undefined,
    };
  });
}

// ─── Inbox ──────────────────────────────────────────────────────────────────

export async function respondInbox(id: ID, input: { value?: string; label?: string; comment?: string }) {
  const r = await run("inbox:respond", (ctx) => wf.respondToInbox(ctx, id, input), "Thanks — Fabrik has what it needs");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function dismissInboxItem(id: ID) {
  const r = await run("inbox:respond", (ctx) => wf.dismissInbox(ctx, id), "Dismissed");
  refresh();
  return r;
}

export async function askAccountant(question: string) {
  const r = await run("inbox:respond", (ctx) => {
    if (!question.trim()) throw new tx.ValidationError("Write your question first");
    return wf.createInboxItem(ctx, { orgId: ctx.org.id, type: "accountant_question", title: "Question for your Fabrik team", body: question.slice(0, 2000), priority: "normal", createdBy: ctx.user.id });
  }, "Sent to your Fabrik accounting team");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

// ─── Bills & Collect ───────────────────────────────────────────────────────

export async function decideBill(id: ID, action: "approve" | "reject" | "request_review", comment?: string) {
  const r = await run("bills:approve", (ctx) => wf.decideBill(ctx, id, action, comment), action === "approve" ? "Bill approved — it now feeds the cash forecast" : action === "reject" ? "Bill rejected" : "Review requested");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function draftReminder(invoiceId: ID) {
  const r = await run("collect:draft_reminder", (ctx) => wf.draftReminder(ctx, invoiceId));
  refresh();
  return r;
}

export async function approveReminder(invoiceId: ID, reminderId: ID, subject: string, body: string) {
  const r = await run("collect:approve_reminder", (ctx) => wf.approveReminder(ctx, invoiceId, reminderId, { subject, body }), "Reminder approved and sent");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function discardReminder(invoiceId: ID, reminderId: ID) {
  const r = await run("collect:draft_reminder", (ctx) => wf.discardReminder(ctx, invoiceId, reminderId), "Draft discarded");
  refresh();
  return r;
}

// ─── Documents ─────────────────────────────────────────────────────────────

export async function uploadDocuments(form: FormData) {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const kind = (form.get("kind") as DocumentKind | null) || undefined;
  const tag = String(form.get("tag") ?? "");
  const r = await run("documents:upload", async (ctx) => {
    if (!files.length) throw new tx.ValidationError("Choose at least one file");
    if (files.length > 10) throw new tx.ValidationError("Upload up to 10 files at a time");
    const out = [];
    for (const f of files) out.push(await docs.uploadDocument(ctx, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), kindHint: kind && kind !== "other" ? kind : undefined, tags: tag ? [tag] : [] }));
    return out.map((d) => ({ id: d.id, filename: d.filename, status: d.status, candidates: d.match?.candidates ?? [] }));
  }, (d) => (d.length === 1 ? `${d[0]!.filename} processed${d[0]!.candidates.length ? " — possible transaction match found" : ""}` : `${d.length} documents processed`));
  refresh();
  return r;
}

export async function uploadSampleInvoice() {
  const { sampleJohnDeereInvoice } = await import("@/server/pdf");
  const bytes = await sampleJohnDeereInvoice();
  const r = await run("documents:upload", (ctx) => docs.uploadDocument(ctx, { name: "JohnDeere_Invoice_JD-28712.pdf", bytes }), "John Deere invoice extracted by FabrikIDP");
  refresh();
  return r.ok ? { ok: true as const, message: r.message, data: { id: r.data!.id, candidates: r.data!.match?.candidates ?? [] } } : r;
}

export async function confirmDocMatch(docId: ID, txnId: ID) {
  const r = await run("documents:match", (ctx) => docs.confirmMatch(ctx, docId, txnId), (d) => (d.autoProcessed ? "Matched — supporting document cleared the review flag and the transaction was finalized" : "Document matched to transaction"));
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function rejectDocMatch(docId: ID, txnId: ID) {
  const r = await run("documents:match", (ctx) => docs.rejectMatch(ctx, docId, txnId), "Suggestion removed");
  refresh();
  return r;
}

export async function correctDocFields(docId: ID, fields: { vendor?: string; documentNumber?: string; documentDate?: string; dueDate?: string; total?: number; kind?: DocumentKind }) {
  const r = await run("documents:upload", (ctx) => docs.updateExtraction(ctx, docId, fields), "Fields saved and matching re-run");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function billFromDocument(docId: ID, accountId: ID) {
  const r = await run("documents:upload", (ctx) => docs.createBillFromDocument(ctx, docId, accountId), "Bill created — it's waiting for approval in Bills");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function tagDocument(docId: ID, tag: string) {
  const r = await run("documents:upload", (ctx) => {
    const d = docs.getDoc(ctx, docId);
    if (!/^(funding|tax):[a-z0-9-]+$/.test(tag)) throw new tx.ValidationError("Invalid tag");
    if (!d.tags.includes(tag)) d.tags.push(tag);
    commit();
  }, "Document tagged");
  refresh();
  return r;
}

// ─── Reconciliation & close ─────────────────────────────────────────────────

export async function recAction(recId: ID, a: { kind: "accept" | "unmatch"; lineId: ID } | { kind: "match"; lineId: ID; txnId: ID } | { kind: "create"; lineId: ID; accountId: ID } | { kind: "book"; txnId: ID; action: "duplicate" | "outstanding" | "clear" } | { kind: "approve" } | { kind: "reopen" }) {
  const perm = a.kind === "approve" ? "reconciliation:approve" : "reconciliation:work";
  const r = await run(perm, (ctx) => {
    switch (a.kind) {
      case "accept":
        return close.acceptLine(ctx, recId, a.lineId);
      case "unmatch":
        return close.unmatchLine(ctx, recId, a.lineId);
      case "match":
        return close.matchLine(ctx, recId, a.lineId, a.txnId);
      case "create":
        return void close.createFromLine(ctx, recId, a.lineId, a.accountId);
      case "book":
        return close.resolveBookItem(ctx, recId, a.txnId, a.action);
      case "approve":
        return close.approveRec(ctx, recId);
      case "reopen":
        return close.reopenRec(ctx, recId);
    }
  }, a.kind === "approve" ? "Reconciliation approved" : a.kind === "create" ? "Recorded in the books and matched" : a.kind === "book" && a.action === "duplicate" ? "Duplicate excluded from the books" : "Updated");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function closeAction(period: string, a: "bookkeeper_review" | "approve" | "reopen", note?: string) {
  const perm = a === "approve" ? "close:approve" : "close:work";
  const r = await run(perm, (ctx) => (a === "approve" ? close.approveClose(ctx, period, note) : a === "reopen" ? close.reopenClose(ctx, period, note ?? "Reopened") : close.completeManualTask(ctx, period, "bookkeeper_review", note)), a === "approve" ? "Books closed — the finance package is ready" : a === "reopen" ? "Period reopened" : "Bookkeeper review complete");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function setFrequency(f: CloseFrequency) {
  const r = await run("settings:manage", (ctx) => close.setCloseFrequency(ctx, f), "Bookkeeping schedule updated");
  refresh();
  return r;
}

// ─── Funding ───────────────────────────────────────────────────────────────

export async function saveProfile(patch: Partial<FarmProfile>) {
  const r = await run("funding:edit_profile", (ctx) => {
    if (patch.owners && patch.owners.some((o) => !o.name.trim() || o.pct < 0 || o.pct > 100)) throw new tx.ValidationError("Each owner needs a name and a percentage between 0 and 100");
    if (patch.plannedInvestments) patch.plannedInvestments = patch.plannedInvestments.map((p) => ({ ...p, id: p.id || newId("pi") }));
    return void funding.updateProfile(ctx, patch);
  }, "Profile saved — funding matches updated");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function watchProgram(programId: ID, status: FundingWatch["status"], note?: string) {
  const r = await run("funding:read", (ctx) => void funding.setWatch(ctx, programId, status, note), status === "eligibility_check_requested" ? "Eligibility check requested — your Fabrik team will review it with you" : status === "saved" ? "Saved to your shortlist" : status === "dismissed" ? "Hidden from your matches" : "Marked as preparing");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

// ─── CFO ───────────────────────────────────────────────────────────────────

export async function computeScenario(type: ScenarioType, inputs: ScenarioInputs) {
  return run("cfo:scenarios", (ctx) => {
    const r = runScenario(type, inputs, forecastInput(ctx.org.id).input, scenarioBaseline(ctx.org.id));
    return {
      ...r,
      chart: r.baselineForecast.weeks.map((w, i) => ({ label: `W${w.index}`, range: w.label, baseline: w.closing, scenario: r.scenarioForecast.weeks[i]!.closing })),
      baselineForecast: undefined,
      scenarioForecast: { minWeek: r.scenarioForecast.minWeek, weeksBelowBuffer: r.scenarioForecast.weeksBelowBuffer, bufferCents: r.scenarioForecast.bufferCents },
    };
  });
}

export async function saveScenario(type: ScenarioType, name: string, inputs: ScenarioInputs) {
  const r = await run("cfo:scenarios", (ctx) => {
    db().scenarios.push({ id: newId("scn"), orgId: ctx.org.id, type, name: name.slice(0, 80) || type, inputs: inputs as Record<string, number>, createdBy: ctx.user.id, createdAt: new Date().toISOString() });
    commit();
  }, "Scenario saved");
  refresh();
  return r;
}

// ─── Ask Fabrik ─────────────────────────────────────────────────────────────

export async function ask(question: string, threadId?: ID) {
  return run("ask:use", async (ctx) => {
    const { thread, answer } = await askQuestion(ctx, { question, threadId });
    return { threadId: thread.id, answer };
  });
}

// ─── Integrations ──────────────────────────────────────────────────────────

export async function syncNow() {
  const r = await run("integrations:read", (ctx) => integ.runSync(ctx, "manual"), (run) => (run.status === "success" ? `Sync complete · ${run.entities.reduce((s, e) => s + e.fetched, 0).toLocaleString("en-US")} records checked, 0 duplicates created` : `Sync failed: ${run.error?.message}`));
  refresh();
  return r;
}

export async function integrationControl(a: "simulate_on" | "simulate_off" | "disconnect" | "reconnect") {
  const r = await run("integrations:manage", (ctx) => (a === "disconnect" ? integ.disconnect(ctx) : a === "reconnect" ? integ.reconnectSandbox(ctx) : integ.setSimulatedFailure(ctx, a === "simulate_on")), a === "reconnect" ? "QuickBooks reconnected" : a === "disconnect" ? "QuickBooks disconnected" : a === "simulate_on" ? "Next sync will fail (demo)" : "Failure simulation off");
  refresh();
  return r;
}

// ─── Notifications ─────────────────────────────────────────────────────────

export async function readNotifications(ids: ID[] | "all") {
  const ctx = await getCtx();
  if (!ctx) return { ok: false as const, error: "Sign in again." };
  markRead(ctx, ids);
  commit();
  refresh();
  return { ok: true as const };
}

// ─── Team & settings ───────────────────────────────────────────────────────

export async function inviteMember(email: string, name: string, role: ClientRole) {
  const o = await origin();
  const r = await run("team:manage", (ctx) => void admin.inviteMember(ctx, email, name, role, o), `Invitation sent to ${email}`);
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function changeRole(membershipId: ID, role: ClientRole) {
  const r = await run("team:manage", (ctx) => admin.changeMemberRole(ctx, membershipId, role), "Role updated");
  refresh();
  return r;
}

export async function removeMember(membershipId: ID) {
  const r = await run("team:manage", (ctx) => admin.removeMember(ctx, membershipId), "Member removed");
  refresh();
  return r;
}

export async function saveThresholds(autoApprove: number, review: number, largeDollars: number) {
  const r = await run("settings:manage", (ctx) => admin.updateThresholds(ctx, autoApprove, review, largeDollars), (n) => `Thresholds saved${n ? ` · ${n} transaction${n === 1 ? "" : "s"} auto-processed under the new policy` : ""}`);
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function toggleRule(ruleId: ID, active: boolean) {
  const r = await run("rules:manage", (ctx) => admin.toggleRule(ctx, ruleId, active), active ? "Rule enabled" : "Rule disabled");
  refresh();
  return r;
}

// ─── Tax (proposed) ────────────────────────────────────────────────────────

export async function taxRequestStatus(id: ID, status: TaxDocumentRequest["status"], comment?: string, documentId?: ID) {
  const r = await run("tax:read", (ctx) => {
    if (status === "cpa_reviewed" && !ctx.isStaff && ctx.role !== "external_accountant") throw new tx.ValidationError("Only the CPA or Fabrik staff can mark a document reviewed");
    return admin.updateTaxRequest(ctx, id, status, comment, documentId);
  }, "Tax item updated");
  refresh();
  return r;
}

// ─── Operations ────────────────────────────────────────────────────────────

export async function updateWork(id: ID, patch: { status?: WorkItem["status"]; assigneeId?: ID }) {
  const r = await run("ops:access", (ctx) => {
    if (patch.assigneeId !== undefined && ctx.role === "fabrik_bookkeeper") throw new tx.ValidationError("Only reviewers and admins can reassign work");
    return void ops.updateWorkItem(ctx, id, patch);
  }, "Work item updated");
  refresh();
  return r;
}

export async function adminOrg(orgId: ID, patch: Partial<Pick<Organization, "plan" | "status" | "assignedBookkeeperId" | "assignedReviewerId" | "dedicatedAccountantId" | "closeFrequency">>) {
  const r = await run("admin:manage", (ctx) => admin.adminUpdateOrg(ctx, orgId, patch), "Organization updated");
  refresh();
  return r;
}

export async function adminStaff(userId: ID, role: StaffRole | "disabled") {
  const r = await run("admin:manage", (ctx) => admin.adminSetStaffRole(ctx, userId, role), "Staff access updated");
  refresh();
  return r;
}

export async function adminRiskRule(key: string, enabled: boolean) {
  const r = await run("admin:manage", (ctx) => admin.adminToggleRiskRule(ctx, key, enabled), enabled ? "Risk rule enabled" : "Risk rule disabled");
  refresh();
  return r;
}

export async function adminResetDemo() {
  const r = await run("admin:reset_demo", (ctx) => admin.adminResetDemo(ctx), "Demo environment restored");
  refresh();
  return r;
}

