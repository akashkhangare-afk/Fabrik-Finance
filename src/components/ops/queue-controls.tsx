"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { WorkItem } from "@/lib/types";
import { updateWork } from "@/app/actions/app";
import { Button, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/client";
import { cn } from "@/lib/cn";

export interface FilterDef {
  key: string;
  label: string;
  /** "" = no filter (the default). */
  options: { value: string; label: string }[];
  allLabel: string;
  defaultValue?: string;
}

/** One row of server-side filters driven by URL search params. */
export function QueueFilters({ filters }: { filters: FilterDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const active = filters.some((f) => sp.get(f.key));
  return (
    <div className={cn("flex flex-wrap lg:flex-nowrap items-end gap-2 transition-opacity", pending && "opacity-60")} role="group" aria-label="Filter work items">
      {filters.map((f) => (
        <div key={f.key} className="flex flex-col gap-1 min-w-0 flex-1 basis-[140px]">
          <label htmlFor={`qf-${f.key}`} className="text-[12px] text-muted font-medium">
            {f.label}
          </label>
          <Select id={`qf-${f.key}`} value={sp.get(f.key) ?? ""} onChange={(e) => set(f.key, e.target.value)} className="h-8 text-[13px]">
            <option value="">{f.allLabel}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ))}
      <Button size="sm" variant="ghost" disabled={!active || pending} onClick={() => start(() => router.push(pathname, { scroll: false }))} className="shrink-0">
        <X className="size-3.5" /> Clear
      </Button>
    </div>
  );
}

const STATUS_OPTS: { value: WorkItem["status"]; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_client", label: "Waiting on client" },
  { value: "done", label: "Done" },
];

function useWorkSave(id: string, title: string) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const save = (patch: { status?: WorkItem["status"]; assigneeId?: string }) =>
    start(async () => {
      const r = await updateWork(id, patch);
      if (r.ok) toast({ tone: "success", title: r.message ?? "Updated", body: title });
      else toast({ tone: "error", title: r.error });
    });
  return { pending, save };
}

export function WorkStatusSelect({ id, title, status }: { id: string; title: string; status: WorkItem["status"] }) {
  const { pending, save } = useWorkSave(id, title);
  return (
    <Select aria-label={`Change status for ${title}`} value={status} disabled={pending} onChange={(e) => save({ status: e.target.value as WorkItem["status"] })} className={cn("h-8 text-[12.5px] w-[146px] shrink-0", pending && "opacity-60")}>
      {STATUS_OPTS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function WorkAssignSelect({ id, title, assigneeId, staff }: { id: string; title: string; assigneeId?: string; staff: { id: string; name: string; role: string }[] }) {
  const { pending, save } = useWorkSave(id, title);
  return (
    <Select aria-label={`Assign ${title}`} value={assigneeId ?? ""} disabled={pending} onChange={(e) => e.target.value && save({ assigneeId: e.target.value })} className={cn("h-8 text-[12.5px] w-[140px] shrink-0", pending && "opacity-60")}>
      {!assigneeId && <option value="">Unassigned</option>}
      {staff.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Select>
  );
}
