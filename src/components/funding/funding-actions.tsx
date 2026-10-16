"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ClipboardCheck, EyeOff, ShieldCheck } from "lucide-react";
import type { FundingWatch } from "@/lib/types";
import { watchProgram } from "@/app/actions/app";
import { Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";

export function FundingActions({ programId, status }: { programId: string; status?: FundingWatch["status"] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (s: FundingWatch["status"]) =>
    start(async () => {
      const r = await watchProgram(programId, s);
      toast(r.ok ? { tone: "success", title: r.message ?? "Saved" } : { tone: "error", title: r.error });
      router.refresh();
    });
  return (
    <div className="space-y-3">
      {status && status !== "dismissed" && <Badge tone="brand">Status: {status.replace(/_/g, " ")}</Badge>}
      <Button variant="primary" size="lg" className="w-full" disabled={pending || status === "eligibility_check_requested"} onClick={() => set("eligibility_check_requested")}>
        <ShieldCheck className="size-4" /> {status === "eligibility_check_requested" ? "Eligibility check requested" : "Check eligibility"}
      </Button>
      <p className="text-[11.5px] text-muted">Your Fabrik team reviews the program with you and the administering agency or lender. Nothing is submitted on your behalf.</p>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" disabled={pending} onClick={() => set("saved")}><Bookmark className="size-3.5" /> Save</Button>
        <Button size="sm" disabled={pending} onClick={() => set("preparing")}><ClipboardCheck className="size-3.5" /> Preparing</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("dismissed")}><EyeOff className="size-3.5" /> Hide</Button>
      </div>
    </div>
  );
}
