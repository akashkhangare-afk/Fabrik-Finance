"use client";

import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { switchOrg } from "@/app/actions/auth";
import { Button, Card, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";
import { cn } from "@/lib/cn";

/** Server actions operate on the active org only, so cross-client navigation switches first. */
export function useOrgNav() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const go = (orgId: string, href: string, activeOrgId?: string) =>
    start(async () => {
      if (orgId !== activeOrgId) {
        const r = await switchOrg(orgId);
        if (!r.ok) {
          toast({ tone: "error", title: r.error });
          return;
        }
      }
      router.push(href);
      router.refresh();
    });
  return { pending, go };
}

/** A link-styled button that switches to the client's workspace before navigating. */
export function OrgLink({ orgId, href, activeOrgId, children, className, title }: { orgId: string; href: string; activeOrgId?: string; children: ReactNode; className?: string; title?: string }) {
  const { pending, go } = useOrgNav();
  return (
    <button type="button" title={title} onClick={() => go(orgId, href, activeOrgId)} disabled={pending} className={cn("text-left text-ink hover:text-brand-700 hover:underline underline-offset-2 decoration-brand-300 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand-500 rounded-sm", className)}>
      {children}
      {pending && <Loader2 className="inline size-3.5 ml-1.5 animate-spin align-[-2px] text-muted" aria-label="Opening" />}
    </button>
  );
}

export function ClientActions({ orgId, activeOrgId, review }: { orgId: string; activeOrgId: string; review: number }) {
  const { pending, go } = useOrgNav();
  return (
    <div className="flex flex-col items-stretch gap-1.5 w-[132px] ml-auto">
      <Button size="sm" disabled={pending} onClick={() => go(orgId, "/ops/review", activeOrgId)} title={`${review} transactions to review`}>
        Review queue
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(orgId, "/", activeOrgId)}>
        Open workspace
      </Button>
    </div>
  );
}

/** Handles deep links like /ops/review?org=… from the work queue. */
export function AutoSwitch({ orgId, orgName, to }: { orgId: string; orgName: string; to: string }) {
  const router = useRouter();
  const toast = useToast();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    switchOrg(orgId).then((r) => {
      if (!r.ok) toast({ tone: "error", title: r.error });
      router.replace(to);
      router.refresh();
    });
  }, [orgId, to, router, toast]);
  return (
    <Card className="max-w-xl">
      <div className="flex items-center gap-3 px-5 py-6 text-[14px] text-ink-2" role="status">
        <Loader2 className="size-4.5 animate-spin text-brand-600" />
        Opening {orgName}…
      </div>
    </Card>
  );
}

export function ClientPicker({ orgs, activeOrgId, to = "/ops/review" }: { orgs: { id: string; name: string; review: number }[]; activeOrgId: string; to?: string }) {
  const { pending, go } = useOrgNav();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="ops-client-picker" className="text-[13px] text-muted whitespace-nowrap">
        Client
      </label>
      <Select id="ops-client-picker" value={activeOrgId} disabled={pending} onChange={(e) => go(e.target.value, to, activeOrgId)} className="w-[min(78vw,300px)]">
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} — {o.review ? `${o.review} to review` : "clear"}
          </option>
        ))}
      </Select>
      {pending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Switching client" />}
    </div>
  );
}
