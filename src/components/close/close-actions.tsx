"use client";

import { useState, useTransition } from "react";
import { closeAction } from "@/app/actions/app";
import { Button, Textarea } from "@/components/ui/primitives";
import { Modal, useToast } from "@/components/ui/client";

export function CloseActions({ period, status, bookkeeperDone, ready, blocking, canWork, canApprove }: { period: string; status: string; bookkeeperDone: boolean; ready: boolean; blocking: string[]; canWork: boolean; canApprove: boolean }) {
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<"bookkeeper_review" | "approve" | "reopen">();
  const [note, setNote] = useState("");
  const toast = useToast();
  const go = (a: "bookkeeper_review" | "approve" | "reopen") =>
    start(async () => {
      const r = await closeAction(period, a, note || undefined);
      toast(r.ok ? { tone: "success", title: r.message ?? "Done" } : { tone: "error", title: r.error });
      setModal(undefined);
      setNote("");
    });
  if (status === "closed") return canApprove ? <Button variant="ghost" onClick={() => setModal("reopen")}>Reopen period</Button> : null;
  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1.5">
      <div className="flex gap-2">
        {canWork && !bookkeeperDone && <Button onClick={() => setModal("bookkeeper_review")}>Complete bookkeeper review</Button>}
        {canApprove && (
          <Button variant="primary" disabled={!ready || pending} onClick={() => setModal("approve")} title={ready ? undefined : `Finish first: ${blocking.join(", ")}`}>
            Approve &amp; close books
          </Button>
        )}
      </div>
      {canApprove && !ready && <span className="text-[11.5px] text-muted max-w-[280px] sm:text-right">Waiting on: {blocking.join(", ").toLowerCase()}</span>}
      {!canWork && !canApprove && <span className="text-[12.5px] text-muted">Your Fabrik team completes and approves the close.</span>}
      {modal && (
        <Modal
          open
          onClose={() => setModal(undefined)}
          title={modal === "approve" ? "Approve and close the books?" : modal === "reopen" ? "Reopen this period?" : "Complete bookkeeper review?"}
          description={modal === "approve" ? "Locks the period and generates the finance package." : modal === "reopen" ? "Removes the reviewer approval." : "Confirm every exception for this period is reviewed."}
          footer={
            <>
              <Button onClick={() => setModal(undefined)}>Cancel</Button>
              <Button variant="primary" disabled={pending || (modal === "reopen" && !note.trim())} onClick={() => go(modal)}>{pending ? "Working…" : "Confirm"}</Button>
            </>
          }
        >
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={modal === "reopen" ? "Reason (required)" : "Note for the audit trail (optional)"} />
        </Modal>
      )}
    </div>
  );
}
