import type { ReactNode } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import type { WorkItem, WorkItemType } from "@/lib/types";
import { Badge, Card, EmptyState, LinkButton, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/** Shared table styles for the operations portal. */
export const th = "text-left text-[12px] text-muted font-medium px-3 py-2 whitespace-nowrap first:pl-5 last:pr-5";
export const thNum = cn(th, "text-right");
export const td = "px-3 py-2.5 align-middle first:pl-5 last:pr-5";
export const tdNum = cn(td, "text-right tabular whitespace-nowrap");
export const tr = "border-t border-line hover:bg-surface-2 transition-colors";

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  );
}

export function StaffOnly() {
  return (
    <Card className="max-w-xl">
      <EmptyState icon={<Lock className="size-5" />} title="Fabrik staff only" description="The Operations Portal is where the Fabrik accounting team manages exceptions across clients. Your finance workspace has everything for your business." action={<LinkButton href="/" variant="primary">Go to Home</LinkButton>} />
    </Card>
  );
}

export function Restricted({ what = "Administration" }: { what?: string }) {
  return (
    <Card className="max-w-xl">
      <EmptyState icon={<ShieldCheck className="size-5" />} title={`${what} is restricted`} description="Only Fabrik Admins can manage organizations, staff access, risk rules and the demo environment. Ask an admin if you need a change." action={<LinkButton href="/ops">Back to Operations</LinkButton>} />
    </Card>
  );
}

export const PRIORITY_TONE: Record<WorkItem["priority"], Tone> = { critical: "crit", high: "risk", medium: "warn", low: "neutral" };
export const PRIORITY_RANK: Record<WorkItem["priority"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function PriorityBadge({ priority }: { priority: WorkItem["priority"] }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} dot>
      {priority[0]!.toUpperCase() + priority.slice(1)}
    </Badge>
  );
}

export const WORK_TYPE_LABEL: Record<WorkItemType, string> = {
  reconciliation_difference: "Reconciliation",
  review_transactions: "Transaction review",
  missing_statement: "Missing statement",
  client_question_followup: "Client follow-up",
  close_review: "Close review",
  integration_error: "Integration error",
  document_review: "Document review",
  catch_up: "Catch-up",
};

export const WORK_STATUS_LABEL: Record<WorkItem["status"], string> = { open: "Open", in_progress: "In progress", waiting_on_client: "Waiting on client", done: "Done" };

/** 6.4 → "6.4", 23.7 → "24" */
export function fmtMinutes(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "0";
  return m < 10 ? m.toFixed(1) : String(Math.round(m));
}

export function pctText(v: number): string {
  return `${Math.round(v * 100)}%`;
}
