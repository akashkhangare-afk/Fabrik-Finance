"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input, Select } from "@/components/ui/primitives";
import { addDays, today } from "@/lib/dates";

const STATUS_TABS = [
  ["", "All"],
  ["needs_review", "Needs review"],
  ["waiting_for_client", "Waiting for client"],
  ["processed", "Processed"],
  ["approved", "Approved"],
  ["excluded", "Excluded"],
] as const;

export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!("page" in patch)) next.delete("page");
    router.push(`${pathname}?${next}`, { scroll: false });
  };
  return { sp, set };
}

export function TxnFiltersBar({ banks, accounts, vendors, counts }: { banks: { id: string; name: string }[]; accounts: { id: string; name: string }[]; vendors: { id: string; name: string }[]; counts: Record<string, number> }) {
  const { sp, set } = useQueryState();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => (q !== (sp.get("q") ?? "") ? set({ q: q || undefined }) : undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const d = today();
  const range = sp.get("from") === `${d.slice(0, 4)}-01-01` && !sp.get("to") ? "ytd" : sp.get("from") === addDays(d, -30) ? "30d" : sp.get("from") === addDays(d, -90) ? "90d" : sp.get("from") || sp.get("to") ? "custom" : "all";
  const active = ["q", "from", "to", "bank", "account", "vendor", "min", "max", "confidence"].some((k) => sp.get(k));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="Status">
        {STATUS_TABS.map(([v, label]) => {
          const on = (sp.get("status") ?? "") === v;
          const n = v ? (counts[v] ?? 0) : total;
          return (
            <button key={v} role="tab" aria-selected={on} onClick={() => set({ status: v || undefined })} className={cn("h-8 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition", on ? "bg-ink text-white" : "text-ink-2 hover:bg-sunken")}>
              {label}
              <span className={cn("text-[11.5px] tabular", on ? "text-white/70" : "text-muted")}>{n.toLocaleString("en-US")}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="size-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payee, description, amount" className="pl-9" aria-label="Search transactions" />
        </div>
        <Select aria-label="Date range" value={range} onChange={(e) => {
          const v = e.target.value;
          if (v === "all") set({ from: undefined, to: undefined });
          else if (v === "30d") set({ from: addDays(d, -30), to: undefined });
          else if (v === "90d") set({ from: addDays(d, -90), to: undefined });
          else if (v === "ytd") set({ from: `${d.slice(0, 4)}-01-01`, to: undefined });
        }} className="w-auto">
          <option value="all">All dates</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="ytd">Year to date</option>
          {range === "custom" && <option value="custom">Custom range</option>}
        </Select>
        <Select aria-label="Bank account" value={sp.get("bank") ?? ""} onChange={(e) => set({ bank: e.target.value || undefined })} className="w-auto max-w-[220px]">
          <option value="">All accounts</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select aria-label="Category" value={sp.get("account") ?? ""} onChange={(e) => set({ account: e.target.value || undefined })} className="w-auto max-w-[220px]">
          <option value="">All categories</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select aria-label="Vendor" value={sp.get("vendor") ?? ""} onChange={(e) => set({ vendor: e.target.value || undefined })} className="w-auto max-w-[200px]">
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select aria-label="AI confidence" value={sp.get("confidence") ?? ""} onChange={(e) => set({ confidence: e.target.value || undefined })} className="w-auto">
          <option value="">Any confidence</option>
          <option value="high">High (auto)</option>
          <option value="medium">Medium (review)</option>
          <option value="low">Low (clarify)</option>
        </Select>
        <div className="flex items-center gap-1">
          <Input aria-label="Minimum amount" inputMode="decimal" placeholder="Min $" defaultValue={sp.get("min") ?? ""} onBlur={(e) => set({ min: e.target.value || undefined })} className="w-24" />
          <span className="text-muted">–</span>
          <Input aria-label="Maximum amount" inputMode="decimal" placeholder="Max $" defaultValue={sp.get("max") ?? ""} onBlur={(e) => set({ max: e.target.value || undefined })} className="w-24" />
        </div>
        {active && (
          <button onClick={() => { setQ(""); set({ q: undefined, from: undefined, to: undefined, bank: undefined, account: undefined, vendor: undefined, min: undefined, max: undefined, confidence: undefined }); }} className="h-9 px-2.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-sunken inline-flex items-center gap-1">
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
