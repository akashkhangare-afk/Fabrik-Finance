"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, ExternalLink, FileImage, FileText, Search, Sparkles, Upload, X } from "lucide-react";
import type { DocumentKind, ExtractionResult } from "@/lib/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { prettyDate } from "@/lib/dates";
import { billFromDocument, confirmDocMatch, correctDocFields, rejectDocMatch, uploadDocuments, uploadSampleInvoice } from "@/app/actions/app";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, Select, StatusPill, pillListClass, pillClass, pillCountClass } from "@/components/ui/primitives";
import { Drawer, useToast } from "@/components/ui/client";
import { useQueryState } from "@/components/books/filters";

export interface DocRow {
  id: string;
  filename: string;
  kind: DocumentKind;
  status: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  tags: string[];
  error?: string;
  synthetic: boolean;
  extraction?: Pick<ExtractionResult, "vendor" | "documentNumber" | "documentDate" | "dueDate" | "subtotal" | "tax" | "total" | "currency" | "poNumber" | "lineItems" | "fieldConfidence" | "provider" | "providerVersion" | "warnings">;
  matchStatus: string;
  matched?: { id: string; date: string; description: string; amount: number; vendor: string };
  candidates: { transactionId: string; confidence: number; reasons: string[]; date: string; description: string; amount: number; vendor: string; category: string }[];
  hasBill: boolean;
}

const KIND_LABEL: Record<string, string> = { invoice: "Invoice", receipt: "Receipt", bank_statement: "Bank statement", credit_card_statement: "Card statement", entity_document: "Entity document", farm_record: "Farm record", tax_document: "Tax document", other: "Other" };
const PAGE = 50;
const GROUPS = [["", "All", "all"], ["invoices", "Invoices", "invoices"], ["receipts", "Receipts", "receipts"], ["statements", "Statements", "statements"], ["records", "Entity & farm", "records"]] as const;

export function DocumentsView({ rows, counts, kind, q, openId, canUpload, canMatch, demo, extras, expenseAccounts }: { rows: DocRow[]; counts: Record<string, number>; kind?: string; q?: string; openId?: string; canUpload: boolean; canMatch: boolean; demo: boolean; extras: boolean; expenseAccounts: { id: string; name: string }[] }) {
  const { set } = useQueryState();
  const [open, setOpen] = useState(openId);
  const [search, setSearch] = useState(q ?? "");
  useEffect(() => setOpen(openId), [openId]);
  useEffect(() => {
    const t = setTimeout(() => search !== (q ?? "") && set({ q: search || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const doc = rows.find((r) => r.id === open);
  // Long libraries render in pages of 50 so the list stays quick to scan; filters reset the page.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [kind, q]);
  const shown = rows.slice(0, limit);
  return (
    <div className="space-y-5">
      {canUpload && <UploadZone demo={demo} onUploaded={(id) => setOpen(id)} />}
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className={pillListClass} role="tablist" aria-label="Document type">
          {GROUPS.filter(([v]) => extras || v !== "records").map(([v, label, key]) => (
            <button key={v} role="tab" aria-selected={(kind ?? "") === v} onClick={() => set({ kind: v || undefined })} className={pillClass((kind ?? "") === v)}>
              {label} <span className={pillCountClass((kind ?? "") === v)}>{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative md:w-72">
          <Search className="size-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file, vendor or number" className="pl-9" aria-label="Search documents" />
        </div>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No documents here yet" description="Upload invoices, receipts, bank or card statements." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[12px] text-muted text-left bg-surface-2 border-b border-line whitespace-nowrap">
                  <th className="px-5 py-2.5 font-medium">Document</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Vendor · number</th>
                  <th className="px-3 py-2.5 font-medium text-right">Total</th>
                  <th className="px-3 py-2.5 font-medium">Matched transaction</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(r.id)} className="border-b border-line last:border-0 hover:bg-surface-2 cursor-pointer outline-none focus-visible:bg-brand-50/60 focus-visible:shadow-[inset_3px_0_0_var(--color-brand-600)]">
                    <td className="px-5 py-2.5 max-w-[300px]">
                      <div className="flex items-center gap-2.5">
                        {r.mimeType.startsWith("image/") ? <FileImage className="size-4 text-muted shrink-0" /> : <FileText className="size-4 text-muted shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.filename}</div>
                          <div className="text-[11.5px] text-muted truncate">{r.uploadedBy} · {r.uploadedAt}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{KIND_LABEL[r.kind]}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="block max-w-[240px] truncate">{r.extraction?.vendor ?? "—"}{r.extraction?.documentNumber ? <span className="text-muted"> · {r.extraction.documentNumber}</span> : null}</span></td>
                    <td className="px-3 py-2.5 text-right tabular whitespace-nowrap">{r.extraction?.total != null && r.extraction.total > 0 ? money(r.extraction.total, { decimals: true }) : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.matched ? (
                        <span className="text-ink-2">{r.matched.vendor} · {prettyDate(r.matched.date)}</span>
                      ) : r.candidates.length ? (
                        <Badge tone="ai"><Sparkles className="size-3" /> {Math.round(r.candidates[0]!.confidence * 100)}% match found</Badge>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5"><StatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-line text-[12.5px] text-muted">
              <span className="tabular">{shown.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}</span>
              {rows.length > limit && (
                <Button size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show {Math.min(PAGE, rows.length - limit)} more
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
      <DocDrawer doc={doc} onClose={() => { setOpen(undefined); if (openId) set({ doc: undefined }); }} canMatch={canMatch} canUpload={canUpload} demo={demo} expenseAccounts={expenseAccounts} />
    </div>
  );
}

function UploadZone({ demo, onUploaded }: { demo: boolean; onUploaded: (id: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState("other");
  const toast = useToast();
  const send = (files: FileList | File[]) => {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    fd.append("kind", kind);
    start(async () => {
      const r = await uploadDocuments(fd);
      toast(r.ok ? { tone: "success", title: r.message ?? "Uploaded" } : { tone: "error", title: r.error });
      if (r.ok && r.data?.length === 1) onUploaded(r.data[0]!.id);
    });
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) send(e.dataTransfer.files); }}
      className={cn("rounded-2xl border-2 border-dashed px-6 py-6 flex flex-col md:flex-row items-center gap-5 transition", drag ? "border-brand-500 bg-brand-50" : "border-line-strong bg-surface")}
    >
      <div className="size-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
        <Upload className="size-5" />
      </div>
      <div className="flex-1 text-center md:text-left">
        <div className="text-[15px] font-semibold">{pending ? "FabrikIDP is reading your document…" : "Drag & drop documents, or choose files"}</div>
        <div className="text-[13px] text-muted mt-0.5">PDF or image, up to 15 MB</div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Select aria-label="Document type" value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
          <option value="other">Detect type automatically</option>
          <option value="invoice">Invoice</option>
          <option value="receipt">Receipt</option>
          <option value="bank_statement">Bank statement</option>
          <option value="credit_card_statement">Credit-card statement</option>
        </Select>
        <input ref={ref} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files && send(e.target.files)} />
        <Button variant="primary" disabled={pending} onClick={() => ref.current?.click()}>Choose files</Button>
        {demo && (
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await uploadSampleInvoice();
            toast(r.ok ? { tone: "success", title: r.message ?? "Uploaded" } : { tone: "error", title: r.error });
            if (r.ok) onUploaded(r.data!.id);
          })}>
            <Sparkles className="size-4" /> Sample John Deere invoice
          </Button>
        )}
      </div>
    </div>
  );
}

const FIELDS: [keyof NonNullable<DocRow["extraction"]>, string][] = [["vendor", "Vendor"], ["documentNumber", "Document number"], ["documentDate", "Document date"], ["dueDate", "Due date"], ["poNumber", "PO number"], ["subtotal", "Subtotal"], ["tax", "Tax"], ["total", "Total"], ["currency", "Currency"]];

function DocDrawer({ doc, onClose, canMatch, canUpload, demo, expenseAccounts }: { doc?: DocRow; onClose: () => void; canMatch: boolean; canUpload: boolean; demo: boolean; expenseAccounts: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [billAcct, setBillAcct] = useState("");
  const toast = useToast();
  useEffect(() => setEditing(doc?.status === "needs_review"), [doc?.id, doc?.status]);
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { tone: "success", title: r.message ?? "Done" } : { tone: "error", title: r.error ?? "Failed" });
    });
  if (!doc) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const e = doc.extraction;
  const fmtVal = (k: string, v: unknown) => (v == null || v === "" ? "—" : ["subtotal", "tax", "total"].includes(k) ? money(v as number, { decimals: true }) : k.endsWith("Date") ? prettyDate(v as string, { year: true }) : String(v));
  return (
    <Drawer open onClose={onClose} width={1040} title={doc.filename} subtitle={`${KIND_LABEL[doc.kind]} · ${doc.uploadedAt}`}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <div>
          <div className="rounded-xl border border-line overflow-hidden bg-sunken aspect-[8.5/11]">
            {doc.mimeType.startsWith("image/") && !doc.synthetic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/v1/documents/${doc.id}/file`} alt={doc.filename} className="w-full h-full object-contain" />
            ) : (
              <iframe src={`/api/v1/documents/${doc.id}/file#toolbar=0&view=FitH`} title={`Preview of ${doc.filename}`} className="w-full h-full" />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
            <span>{doc.synthetic ? (demo ? "Seeded record — preview is generated from extracted fields (synthetic)." : "") : `${(doc.size / 1024).toFixed(0)} KB`}</span>
            <a href={`/api/v1/documents/${doc.id}/file?download=1`} className="inline-flex items-center gap-1 text-brand-700 hover:underline">Download <ExternalLink className="size-3" /></a>
          </div>
        </div>
        <div className="space-y-5 min-w-0">
          <StatusPill status={doc.status} />
          {doc.error && <Notice tone="crit" title="Extraction failed">{doc.error}</Notice>}
          {e?.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

          {e && !editing && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-semibold">Extracted fields</h3>
                {canUpload && <button onClick={() => setEditing(true)} className="text-[12.5px] text-brand-700 hover:underline">Correct fields</button>}
              </div>
              <div className="rounded-xl border border-line divide-y divide-line">
                {FIELDS.filter(([k]) => e[k] != null && e[k] !== "").map(([k, label]) => (
                  <div key={k} className="flex items-center gap-3 px-3.5 py-2 text-[13px]">
                    <span className="text-muted w-32 shrink-0">{label}</span>
                    <span className="flex-1 font-medium tabular truncate">{fmtVal(k, e[k])}</span>
                    {e.fieldConfidence[k] != null && e.fieldConfidence[k]! < 0.95 && <span className="text-[11.5px] tabular text-warn-700">{Math.round(e.fieldConfidence[k]! * 100)}%</span>}
                  </div>
                ))}
              </div>
              {e.lineItems.length > 0 && (
                <div className="mt-3 rounded-xl border border-line overflow-hidden">
                  <div className="px-3.5 py-2 text-[12px] font-medium text-muted bg-surface-2 border-b border-line">Line items</div>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {e.lineItems.map((li, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="px-3.5 py-1.5">{li.description}</td>
                          <td className="px-2 py-1.5 text-right text-muted tabular">{li.quantity ?? ""}</td>
                          <td className="px-3.5 py-1.5 text-right tabular">{money(li.amount, { decimals: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {editing && canUpload && <FieldEditor doc={doc} onDone={() => setEditing(false)} />}

          {(doc.kind === "invoice" || doc.kind === "receipt") && (
            <section>
              <h3 className="text-[13px] font-semibold mb-2">Transaction match</h3>
              {doc.matched ? (
                <div className="rounded-xl border border-[#b9dfc4] bg-ok-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ok-600"><Check className="size-4" /> Matched</div>
                  <div className="mt-1.5 flex items-center justify-between text-[13px]">
                    <span>{doc.matched.vendor} · {prettyDate(doc.matched.date, { year: true })}</span>
                    <span className="font-semibold tabular">{money(doc.matched.amount, { decimals: true })}</span>
                  </div>
                  <Link href={`/books?txn=${doc.matched.id}`} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-brand-700 hover:underline">Open transaction <ArrowRight className="size-3" /></Link>
                </div>
              ) : doc.candidates.length ? (
                <div className="space-y-2">
                  {doc.candidates.map((c, i) => (
                    <div key={c.transactionId} className={cn("rounded-xl border px-4 py-3", i === 0 ? "border-ai-100 bg-ai-50/40" : "border-line")}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium text-ai-600">Possible transaction</div>
                        <span className="text-[13px] font-semibold tabular">Match confidence: {Math.round(c.confidence * 100)}%</span>
                      </div>
                      <div className="mt-2.5 font-mono text-[12.5px]">{c.description}</div>
                      <div className="mt-0.5 flex items-center justify-between text-[13px]">
                        <span className="text-muted">{prettyDate(c.date, { year: true })} · {c.category}</span>
                        <span className="font-semibold tabular">{money(c.amount, { decimals: true })}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.reasons.slice(0, 2).map((r) => <Badge key={r} tone="neutral">{r}</Badge>)}
                      </div>
                      {canMatch && (
                        <div className="mt-3 flex gap-2">
                          <Button variant="primary" size="sm" disabled={pending} onClick={() => act(() => confirmDocMatch(doc.id, c.transactionId))}>Match</Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => rejectDocMatch(doc.id, c.transactionId))}><X className="size-3.5" /> Not this one</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-muted">No matching transaction yet.</p>
                  {canUpload && doc.kind === "invoice" && !doc.hasBill && e?.total && (
                    <div className="flex gap-2">
                      <Select aria-label="Expense category" value={billAcct} onChange={(ev) => setBillAcct(ev.target.value)} className="flex-1">
                        <option value="">Category for the bill…</option>
                        {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </Select>
                      <Button disabled={!billAcct || pending} onClick={() => act(() => billFromDocument(doc.id, billAcct))}>Create bill</Button>
                    </div>
                  )}
                  {doc.hasBill && <Badge tone="brand">Bill created</Badge>}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function FieldEditor({ doc, onDone }: { doc: DocRow; onDone: () => void }) {
  const e = doc.extraction;
  const [v, setV] = useState({ vendor: e?.vendor ?? "", documentNumber: e?.documentNumber ?? "", documentDate: e?.documentDate ?? "", dueDate: e?.dueDate ?? "", total: e?.total != null ? String(e.total / 100) : "", kind: doc.kind });
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <section className="rounded-xl border border-line p-4 space-y-3">
      <h3 className="text-[13px] font-semibold">Confirm the key fields</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Vendor"><Input value={v.vendor} onChange={(x) => setV({ ...v, vendor: x.target.value })} /></Field>
        <Field label="Document number"><Input value={v.documentNumber} onChange={(x) => setV({ ...v, documentNumber: x.target.value })} /></Field>
        <Field label="Document date"><Input type="date" value={v.documentDate} onChange={(x) => setV({ ...v, documentDate: x.target.value })} /></Field>
        <Field label="Due date"><Input type="date" value={v.dueDate} onChange={(x) => setV({ ...v, dueDate: x.target.value })} /></Field>
        <Field label="Total (USD)"><Input inputMode="decimal" value={v.total} onChange={(x) => setV({ ...v, total: x.target.value })} /></Field>
        <Field label="Type">
          <Select value={v.kind} onChange={(x) => setV({ ...v, kind: x.target.value as DocumentKind })}>
            <option value="invoice">Invoice</option>
            <option value="receipt">Receipt</option>
            <option value="bank_statement">Bank statement</option>
            <option value="credit_card_statement">Card statement</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const total = v.total ? Math.round(parseFloat(v.total.replace(/[$,]/g, "")) * 100) : undefined;
              const r = await correctDocFields(doc.id, { vendor: v.vendor || undefined, documentNumber: v.documentNumber || undefined, documentDate: v.documentDate || undefined, dueDate: v.dueDate || undefined, total: Number.isFinite(total) ? total : undefined, kind: v.kind });
              toast(r.ok ? { tone: "success", title: r.message ?? "Saved" } : { tone: "error", title: r.error });
              if (r.ok) onDone();
            })
          }
        >
          Save &amp; match
        </Button>
      </div>
    </section>
  );
}
