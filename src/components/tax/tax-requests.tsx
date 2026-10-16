"use client";

import { Fragment, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import type { TaxDocumentRequest } from "@/lib/types";
import { taxRequestStatus } from "@/app/actions/app";
import { Button, Field, Select, StatusPill, Textarea } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/client";
import { useAct } from "@/components/settings/use-act";
import { cn } from "@/lib/cn";

type Status = TaxDocumentRequest["status"];

export interface TaxRequestView {
  id: string;
  title: string;
  description: string;
  status: Status;
  document?: { id: string; filename: string };
  history: { status: Status; by: string; at: string; comment?: string }[];
}

const NEXT: Partial<Record<Status, Status>> = { requested: "received", received: "cpa_reviewed", cpa_reviewed: "client_approved", client_approved: "filed" };
const ACTION_LABEL: Record<Status, string> = { requested: "Re-request", received: "Mark received", cpa_reviewed: "Mark CPA reviewed", client_approved: "Approve for filing", filed: "Filed by CPA" };
const WAITING: Record<Status, string> = { requested: "", received: "Waiting on the client", cpa_reviewed: "Waiting on CPA review", client_approved: "Waiting on client approval", filed: "Waiting on CPA to file" };

interface Perms {
  canAct: boolean;
  isCpa: boolean;
  isStaff: boolean;
  isClientApprover: boolean;
}

function allowed(next: Status, p: Perms) {
  if (!p.canAct) return false;
  switch (next) {
    case "received":
      return p.isClientApprover || p.isStaff;
    case "cpa_reviewed":
    case "filed":
      return p.isCpa || p.isStaff;
    case "client_approved":
      return p.isClientApprover;
    default:
      return false;
  }
}

export function TaxRequests({ requests, documents, ...perms }: { requests: TaxRequestView[]; documents: { id: string; filename: string }[] } & Perms) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<{ req: TaxRequestView; next: Status } | null>(null);
  return (
    <>
      <div className="relative overflow-x-auto border-t border-line">
        <table className="w-full text-[13px] min-w-[760px]">
          <thead>
            <tr className="text-left text-[12px] text-muted font-medium">
              <th className="px-5 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 font-medium">Document</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Next step</th>
              <th className="px-5 py-2.5 font-medium text-right">History</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const next = NEXT[r.status];
              const can = next ? allowed(next, perms) : false;
              const expanded = open[r.id];
              return (
                <Fragment key={r.id}>
                  <tr className="border-t border-line hover:bg-surface-2 align-top">
                    <td className="px-5 py-3 max-w-[340px]">
                      <div className="font-medium text-ink">{r.title}</div>
                      <div className="text-[12px] text-muted mt-0.5">{r.description}</div>
                    </td>
                    <td className="px-3 py-3">
                      {r.document ? (
                        <a href={`/api/v1/documents/${r.document.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline max-w-[200px]">
                          <FileText className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{r.document.filename}</span>
                        </a>
                      ) : (
                        <span className="text-subtle">Not received</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-3">
                      {!next ? (
                        <span className="text-[12px] text-muted">Complete</span>
                      ) : can ? (
                        <Button size="sm" variant={next === "client_approved" ? "primary" : "secondary"} onClick={() => setTarget({ req: r, next })}>
                          {ACTION_LABEL[next]}
                        </Button>
                      ) : (
                        <span className="text-[12px] text-muted">{WAITING[next]}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                        aria-expanded={expanded}
                        aria-controls={`hist-${r.id}`}
                        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"
                      >
                        {r.history.length} {r.history.length === 1 ? "event" : "events"}
                        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr id={`hist-${r.id}`} className="bg-surface-2">
                      <td colSpan={5} className="px-5 pb-3 pt-1">
                        <ol className="border-l border-line-strong ml-1.5 pl-4 space-y-2 py-1">
                          {r.history.map((h, i) => (
                            <li key={i} className="relative">
                              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-brand-500 ring-2 ring-surface-2" aria-hidden />
                              <div className="flex items-center gap-2 flex-wrap">
                                <StatusPill status={h.status} />
                                <span className="text-ink-2">{h.by}</span>
                                <span className="text-[12px] text-muted tabular">{h.at} UTC</span>
                              </div>
                              {h.comment && <div className="text-[12.5px] text-ink-2 mt-0.5">“{h.comment}”</div>}
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-line text-[12px] text-muted">
        CPA review and filing are recorded by your CPA or Fabrik team; approval for filing is given by a Business Owner or Client Finance User. Fabrik records the step — your CPA files the return.
      </div>
      {target && <AdvanceModal key={target.req.id + target.next} req={target.req} next={target.next} documents={documents} onClose={() => setTarget(null)} />}
    </>
  );
}

function AdvanceModal({ req, next, documents, onClose }: { req: TaxRequestView; next: Status; documents: { id: string; filename: string }[]; onClose: () => void }) {
  const { pending, act } = useAct();
  const [comment, setComment] = useState("");
  const [docId, setDocId] = useState("");
  const offerDoc = next === "received" && !req.document && documents.length > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={ACTION_LABEL[next]}
      description={<>{req.title}</>}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => act(() => taxRequestStatus(req.id, next, comment.trim() || undefined, docId || undefined), (r) => r.ok && onClose())}
          >
            {pending ? "Saving…" : ACTION_LABEL[next]}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {offerDoc && (
          <Field label="Link a document (optional)" htmlFor="tax-doc" hint="Choose a file already uploaded to Documents.">
            <Select id="tax-doc" value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">No document</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Comment (optional)" htmlFor="tax-comment">
          <Textarea id="tax-comment" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={next === "client_approved" ? "e.g. Reviewed with Linda — OK to file" : "Add context for the audit trail"} />
        </Field>
        {next === "filed" && <p className="text-[12px] text-muted">Records that your CPA filed this item. Fabrik does not e-file.</p>}
      </div>
    </Modal>
  );
}
