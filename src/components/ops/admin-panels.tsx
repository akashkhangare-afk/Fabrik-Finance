"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import type { CloseFrequency, Plan, StaffRole } from "@/lib/types";
import { adminOrg, adminResetDemo, adminRiskRule, adminStaff } from "@/app/actions/app";
import { Button, Select } from "@/components/ui/primitives";
import { ConfirmDialog, useToast } from "@/components/ui/client";
import { cn } from "@/lib/cn";

type R = { ok: true; message?: string } | { ok: false; error: string };

function useSave() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<R>, body?: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast({ tone: "success", title: r.message ?? "Saved", body });
      else toast({ tone: "error", title: r.error });
      router.refresh();
    });
  return { pending, save };
}

export interface StaffOpt {
  id: string;
  name: string;
  role?: StaffRole;
}

export interface OrgAdminRow {
  id: string;
  name: string;
  plan: Plan;
  status: "active" | "onboarding" | "paused" | "churned";
  closeFrequency: CloseFrequency;
  bookkeeperId?: string;
  reviewerId?: string;
  accountantId?: string;
}

type OrgPatch = Parameters<typeof adminOrg>[1];

const sel = "h-8 text-[12.5px] shrink-0";
const W = { plan: "w-[118px]", status: "w-[122px]", frequency: "w-[116px]", bookkeeper: "w-[132px]", reviewer: "w-[132px]", accountant: "w-[132px]" } as const;

export function OrgAdminControls({ row, staff, field }: { row: OrgAdminRow; staff: StaffOpt[]; field: "plan" | "status" | "bookkeeper" | "reviewer" | "accountant" | "frequency" }) {
  const { pending, save } = useSave();
  const apply = (patch: OrgPatch) => save(() => adminOrg(row.id, patch), row.name);
  const people = (ids: (StaffRole | undefined)[], current?: string) => {
    const list = staff.filter((s) => ids.includes(s.role) || s.id === current);
    return list.map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}
      </option>
    ));
  };
  const common = { disabled: pending, className: cn(sel, W[field], pending && "opacity-60") };
  switch (field) {
    case "plan":
      return (
        <Select aria-label={`Plan for ${row.name}`} value={row.plan} onChange={(e) => apply({ plan: e.target.value as Plan })} {...common}>
          <option value="essentials">Essentials</option>
          <option value="growth">Growth</option>
          <option value="enterprise">Enterprise</option>
        </Select>
      );
    case "status":
      return (
        <Select aria-label={`Status for ${row.name}`} value={row.status} onChange={(e) => apply({ status: e.target.value as OrgAdminRow["status"] })} {...common}>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="paused">Paused</option>
          {row.status === "churned" && <option value="churned">Churned</option>}
        </Select>
      );
    case "frequency":
      return (
        <Select aria-label={`Close frequency for ${row.name}`} value={row.closeFrequency} onChange={(e) => apply({ closeFrequency: e.target.value as CloseFrequency })} {...common}>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </Select>
      );
    case "bookkeeper":
      return (
        <Select aria-label={`Bookkeeper for ${row.name}`} value={row.bookkeeperId ?? ""} onChange={(e) => e.target.value && apply({ assignedBookkeeperId: e.target.value })} {...common}>
          {!row.bookkeeperId && <option value="">Unassigned</option>}
          {people(["fabrik_bookkeeper"], row.bookkeeperId)}
        </Select>
      );
    case "reviewer":
      return (
        <Select aria-label={`Reviewer for ${row.name}`} value={row.reviewerId ?? ""} onChange={(e) => e.target.value && apply({ assignedReviewerId: e.target.value })} {...common}>
          {!row.reviewerId && <option value="">Unassigned</option>}
          {people(["fabrik_reviewer", "fabrik_admin"], row.reviewerId)}
        </Select>
      );
    case "accountant":
      return (
        <Select aria-label={`Dedicated accountant for ${row.name}`} value={row.accountantId ?? ""} onChange={(e) => e.target.value && apply({ dedicatedAccountantId: e.target.value })} {...common}>
          {!row.accountantId && <option value="">None</option>}
          {people(["fabrik_bookkeeper", "fabrik_reviewer", "fabrik_admin"], row.accountantId)}
        </Select>
      );
  }
}

export function StaffRoleControl({ userId, name, role, disabled, self }: { userId: string; name: string; role: StaffRole; disabled: boolean; self: boolean }) {
  const { pending, save } = useSave();
  if (self) return <span className="text-[12.5px] text-muted">You can&apos;t change your own role</span>;
  return (
    <Select aria-label={`Role for ${name}`} value={disabled ? "disabled" : role} disabled={pending} onChange={(e) => save(() => adminStaff(userId, e.target.value as StaffRole | "disabled"), name)} className={cn(sel, "w-[188px]", pending && "opacity-60")}>
      <option value="fabrik_bookkeeper">Fabrik Bookkeeper</option>
      <option value="fabrik_reviewer">Fabrik Reviewer</option>
      <option value="fabrik_admin">Fabrik Admin</option>
      <option value="disabled">Disabled (no access)</option>
    </Select>
  );
}

export function RiskRuleToggle({ ruleKey, label, enabled }: { ruleKey: string; label: string; enabled: boolean }) {
  const { pending, save } = useSave();
  const [on, setOn] = useState(enabled);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} risk rule`}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        save(async () => {
          const r = await adminRiskRule(ruleKey, next);
          if (!r.ok) setOn(!next);
          return r;
        }, label);
      }}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60", on ? "bg-brand-600" : "bg-line-strong")}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function ResetDemo() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <RotateCcw className="size-4" /> Reset demo data
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        busy={pending}
        title="Reset the demo environment?"
        confirmLabel="Reset demo data"
        description="Every organization, transaction, decision, upload and session returns to the seeded Smith Family Farms story. This can't be undone, and everyone — including you — will need to sign in again."
        onConfirm={() =>
          start(async () => {
            const r = await adminResetDemo();
            setOpen(false);
            if (r.ok) toast({ tone: "success", title: r.message ?? "Demo environment restored", body: "Sign in again to continue." });
            else toast({ tone: "error", title: r.error });
            router.refresh();
          })
        }
      />
    </>
  );
}
