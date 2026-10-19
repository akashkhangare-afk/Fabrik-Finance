"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, FileText, History, Paperclip, Sparkles, ShieldAlert, User, Bot, Cog } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { prettyDate, prettyDateTime } from "@/lib/dates";
import { approveTxn, askClientAboutTxn, draftQuestion, excludeTxn, txnDetail } from "@/app/actions/app";
import { AiBadge, Badge, Button, ConfidenceBadge, EmptyState, Select, Skeleton, StatusPill, Textarea } from "@/components/ui/primitives";
import { Drawer, useHandlingTimer, useToast } from "@/components/ui/client";
import { useQueryState } from "./filters";

export interface TxnRow {
  id: string;
  date: string;
  vendor: string;
  description: string;
  amount: number;
  bank: string;
  category: string;
  suggested: boolean;
  confidence: number;
  status: string;
  hasDoc: boolean;
  risk: string[];
}

type Thresholds = { autoApprove: number; review: number };

export function TxnTable({ rows, total, page, pageSize, thresholds, openId, canReview, canAskClient, staff }: { rows: TxnRow[]; total: number; page: number; pageSize: number; thresholds: Thresholds; openId?: string; canReview: boolean; canAskClient: boolean; staff: boolean }) {
  const { set } = useQueryState();
  const [open, setOpen] = useState<string | undefined>(openId);
  useEffect(() => setOpen(openId), [openId]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!rows.length) return <EmptyState title="No transactions match these filters" description="Try widening the date range or clearing filters." />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] text-muted text-left bg-surface-2 border-b border-line whitespace-nowrap">
              <th className="pl-5 pr-3 py-2.5 font-medium w-[84px]">Date</th>
              <th className="px-3 py-2.5 font-medium">Vendor / Description</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">AI confidence</th>
              <th className="pl-3 pr-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(r.id)} tabIndex={0} className="border-b border-line last:border-0 hover:bg-surface-2 cursor-pointer focus-visible:bg-brand-50/60 focus-visible:outline-none focus-visible:shadow-[inset_3px_0_0_var(--color-brand-600)] outline-none">
                <td className="pl-5 pr-3 py-2.5 text-ink-2 whitespace-nowrap tabular">{prettyDate(r.date)}</td>
                <td className="px-3 py-2.5 max-w-[240px]">
                  <div className="font-medium text-ink truncate flex items-center gap-1.5">
                    {r.vendor}
                    {r.hasDoc && <Paperclip className="size-3 text-subtle shrink-0" aria-label="Has document" />}
                    {r.risk.length > 0 && <ShieldAlert className="size-3 text-warn-500 shrink-0" aria-label={`Risk: ${r.risk.join(", ")}`} />}
                  </div>
                  <div className="text-[11.5px] text-muted font-mono truncate">{r.description}</div>
                </td>
                <td className={cn("px-3 py-2.5 text-right tabular whitespace-nowrap font-medium", r.amount > 0 && "text-ok-600")}>{money(r.amount, { decimals: true, sign: r.amount > 0 })}</td>
                <td className="px-3 py-2.5 text-muted whitespace-nowrap"><span className="block max-w-[150px] 2xl:max-w-[220px] truncate" title={r.bank}>{r.bank}</span></td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="flex items-center gap-1 max-w-[170px] 2xl:max-w-[240px]" title={r.category}>
                    <span className={cn("truncate", r.suggested && "text-ai-600")}>{r.category}</span>
                    {r.suggested && <Sparkles className="size-3 shrink-0 text-ai-500" aria-label="AI suggestion, not yet final" />}
                  </span>
                </td>
                <td className="px-3 py-2.5"><ConfidenceBadge value={r.confidence} thresholds={thresholds} /></td>
                <td className="pl-3 pr-5 py-2.5 whitespace-nowrap"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-t border-line text-[12.5px] text-muted">
        <span className="tabular">{((page - 1) * pageSize + 1).toLocaleString("en-US")}–{Math.min(total, page * pageSize).toLocaleString("en-US")} of {total.toLocaleString("en-US")}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <TransactionDrawer id={open} onClose={() => { setOpen(undefined); if (openId) set({ txn: undefined }); }} canReview={canReview} canAskClient={canAskClient} staff={staff} />
    </>
  );
}

type Detail = Extract<Awaited<ReturnType<typeof txnDetail>>, { ok: true }>["data"];

const ACTOR_ICON = { ai: Bot, user: User, system: Cog };

function TransactionDrawer({ id, onClose, canReview, canAskClient, staff }: { id?: string; onClose: () => void; canReview: boolean; canAskClient: boolean; staff: boolean }) {
  const [d, setD] = useState<Detail>();
  const [err, setErr] = useState<string>();
  const [changing, setChanging] = useState(false);
  const [asking, setAsking] = useState(false);
  const [account, setAccount] = useState("");
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const elapsed = useHandlingTimer(id);

  const load = (txId: string) =>
    txnDetail(txId).then((r) => {
      if (r.ok) setD(r.data);
      else setErr(r.error);
    });
  useEffect(() => {
    setD(undefined);
    setErr(undefined);
    setChanging(false);
    setAsking(false);
    setComment("");
    if (id) void load(id);
  }, [id]);

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, close = true) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { tone: "success", title: r.message ?? "Done" } : { tone: "error", title: r.error ?? "Failed" });
      if (r.ok && close) onClose();
      else if (r.ok && id) void load(id);
    });

  const t = d?.txn;
  const ai = t?.ai;
  const live = t && (t.status === "needs_review" || t.status === "waiting_for_client");
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width={620}
      title={t ? (ai?.normalizedVendor ?? t.description) : "Transaction"}
      subtitle={t ? `${prettyDate(t.date, { year: true })} · ${d!.bank.name} ••••${d!.bank.mask}` : undefined}
      footer={
        t && canReview && live && !asking ? (
          changing ? (
            <>
              <Select aria-label="Category" value={account} onChange={(e) => setAccount(e.target.value)} className="w-auto flex-1 min-w-[200px]">
                <option value="">Choose category…</option>
                {d!.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </Select>
              <Button onClick={() => setChanging(false)}>Cancel</Button>
              <Button variant="primary" disabled={!account || pending} onClick={() => act(() => approveTxn(t.id, { accountId: account, comment: comment || undefined, humanSeconds: elapsed() }))}>Save &amp; approve</Button>
            </>
          ) : (
            <>
              {canAskClient && t.status === "needs_review" && <Button disabled={pending} onClick={async () => { setAsking(true); const r = await draftQuestion(t.id); if (r.ok) setQuestion(r.data ?? ""); }}>Ask client</Button>}
              <Button disabled={pending} onClick={() => { setChanging(true); setAccount(""); }}>Change</Button>
              <Button variant="primary" disabled={pending || !ai} onClick={() => act(() => approveTxn(t.id, { humanSeconds: elapsed() }))}>Approve</Button>
            </>
          )
        ) : t && canReview && !live && t.status !== "excluded" ? (
          <Button variant="ghost" disabled={pending} onClick={() => { setChanging(true); }}>Recategorize</Button>
        ) : undefined
      }
    >
      {err && <EmptyState title="Couldn't load this transaction" description={err} />}
      {!t && !err && (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      )}
      {t && d && (
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[30px] font-semibold tracking-[-0.02em] tabular">{money(t.amount, { decimals: true })}</div>
              <div className="font-mono text-[12px] text-muted mt-1">{t.description}</div>
            </div>
            <StatusPill status={t.status} />
          </div>

          <section className="rounded-xl border border-line overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-line">
              {[
                ["Fabrik category", t.splits?.length ? d.splitNames.map((s) => `${s.name} ${money(s.amount, { decimals: true })}`).join(" · ") : t.accountId ? d.accountName : `${d.suggestedName} (suggested)`],
                ["Transaction type", (ai?.transactionType ?? t.type).replace(/_/g, " ")],
                ["Normalized vendor", ai?.normalizedVendor ?? "—"],
                ...(staff ? [["Write-back to QuickBooks", t.syncState === "synced" ? "Synced" : t.syncState === "pending_writeback" ? "Pending" : "Error"]] : []),
              ].map(([k, v]) => (
                <div key={k} className="bg-surface px-4 py-3">
                  <div className="text-[11.5px] text-muted">{k}</div>
                  <div className="text-[13.5px] font-medium mt-0.5 first-letter:uppercase">{v}</div>
                </div>
              ))}
            </div>
          </section>

          {ai && (
            <section className="rounded-xl border border-ai-100 bg-ai-50/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <AiBadge label="AI recommendation" />
                {staff && <span className="text-[11.5px] text-muted">{ai.model} {ai.modelVersion}</span>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[16px] font-semibold">{d.suggestedName}</div>
                <ConfidenceBadge value={ai.confidence} thresholds={d.thresholds} />
              </div>
              <div className="mt-3 text-[13px] text-ink-2"><span className="font-medium text-ink">Reason: </span>{ai.explanation}</div>
              {staff && (
                <div className="mt-3 text-[12px] text-muted">
                  Decision: {ai.decision === "auto" ? "eligible for automatic processing" : ai.decision === "review" ? "bookkeeper review" : "needs clarification"} · thresholds ≥{Math.round(d.thresholds.autoApprove * 100)}% auto, ≥{Math.round(d.thresholds.review * 100)}% review
                </div>
              )}
            </section>
          )}

          {(t.risk?.reasons.length || ai?.anomaly || ai?.possibleDuplicateOf) && (
            <section className="rounded-xl border border-warn-100 bg-warn-50 p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-warn-700"><AlertTriangle className="size-4" /> Needs a person — risk rules override confidence</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.risk?.reasons.map((r) => <Badge key={r.ruleKey} tone="warn">{r.label}</Badge>)}
              </div>
              {ai?.anomaly && <p className="text-[12.5px] text-warn-700 mt-2">{ai.anomaly.reason}.</p>}
              {d.duplicateOf && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-warn-700">
                  <span><Copy className="inline size-3.5" /> Possible duplicate of {money(d.duplicateOf.amount, { decimals: true })} on {prettyDate(d.duplicateOf.date)}</span>
                  {canReview && live && <Button size="sm" disabled={pending} onClick={() => act(() => excludeTxn(t.id, "Duplicate bank-feed import"))}>Exclude duplicate</Button>}
                </div>
              )}
            </section>
          )}

          {asking && (
            <section className="rounded-xl border border-line p-4 space-y-2">
              <div className="text-[13px] font-semibold">Question for the client</div>
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={2000} />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAsking(false)}>Cancel</Button>
                <Button variant="primary" disabled={!question.trim() || pending} onClick={() => act(() => askClientAboutTxn(t.id, question, elapsed()))}>Send to Finance Inbox</Button>
              </div>
            </section>
          )}
          {changing && (
            <section className="rounded-xl border border-line p-4 space-y-2">
              <div className="text-[13px] font-semibold">Change category</div>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Optional note (kept in the audit trail)" />
              {!live && (
                <div className="flex gap-2">
                  <Select aria-label="Category" value={account} onChange={(e) => setAccount(e.target.value)} className="flex-1">
                    <option value="">Choose category…</option>
                    {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </Select>
                  <Button variant="primary" disabled={!account || pending} onClick={() => act(() => approveTxn(t.id, { accountId: account, comment: comment || undefined, humanSeconds: elapsed() }))}>Save</Button>
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-semibold mb-2">Supporting documents</h3>
            {d.documents.length ? (
              <ul className="space-y-1.5">
                {d.documents.map((doc) => (
                  <li key={doc.id}>
                    <a href={`/api/v1/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:bg-surface-2">
                      <FileText className="size-4 text-muted" />
                      <span className="text-[13px] font-medium flex-1 truncate">{doc.filename}</span>
                      <StatusPill status={doc.status} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No document attached{Math.abs(t.amount) >= 1_000_000 ? " — purchases over $10,000 need an invoice." : "."}</p>
            )}
          </section>

          <details>
            <summary className="text-[13px] font-semibold mb-3 flex items-center gap-1.5 cursor-pointer list-none"><History className="size-4 text-muted" /> Audit trail <span className="text-[12px] font-normal text-muted">({d.audit.length})</span></summary>
            {d.audit.length ? (
              <ol className="relative border-l border-line ml-2 space-y-4">
                {d.audit.map((a) => {
                  const Icon = ACTOR_ICON[a.actor.type];
                  return (
                    <li key={a.id} className="ml-4">
                      <span className={cn("absolute -left-[9px] size-[18px] rounded-full flex items-center justify-center ring-4 ring-surface", a.actor.type === "ai" ? "bg-ai-50 text-ai-600" : a.actor.type === "user" ? "bg-brand-50 text-brand-700" : "bg-sunken text-muted")}>
                        <Icon className="size-3" />
                      </span>
                      <div className="text-[12px] text-muted tabular">{prettyDateTime(a.at)} · {a.actor.name}</div>
                      <div className="text-[13px] mt-0.5">
                        {describe(a.action)}
                        {a.before?.account != null && a.after?.account != null ? `: ${String(a.before.account)} → ${String(a.after.account)}` : a.after?.account != null ? `: ${String(a.after.account)}` : ""}
                        {a.ai && <span className="text-muted"> · confidence {Math.round(a.ai.confidence * 100)}%</span>}
                      </div>
                      {a.comment && <div className="text-[12px] text-ink-2 mt-0.5 italic">“{a.comment}”</div>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-[13px] text-muted">No recorded decisions yet.</p>
            )}
          </details>
        </div>
      )}
    </Drawer>
  );
}

function describe(action: string): string {
  const map: Record<string, string> = {
    "ai.categorization_suggested": "AI suggested",
    "transaction.auto_processed": "Automatically processed",
    "transaction.category_changed": "Category changed",
    "transaction.approved": "Approved",
    "transaction.written_back": "Written back to QuickBooks",
    "rule.learned": "Fabrik learned a rule",
    "transaction.client_question_sent": "Question sent to client",
    "inbox.client_answered": "Client answered",
    "transaction.excluded": "Excluded",
    "transaction.escalated": "Escalated to reviewer",
    "document.matched": "Document matched",
  };
  return map[action] ?? action.replace(/[._]/g, " ");
}
