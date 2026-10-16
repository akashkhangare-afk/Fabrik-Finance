"use client";

import Link from "next/link";
import type { FinancialReport } from "@/server/engines/ledger";
import { cn } from "@/lib/cn";
import { Input, Select } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/client";
import { useQueryState } from "./filters";

const fmt = (c: number) => {
  if (c === 0) return "–";
  const v = Math.round(c / 100);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `(${s})` : s;
};

export function ReportTable({ report, maxCols = 14 }: { report: FinancialReport; maxCols?: number }) {
  const cols = report.columns.slice(-maxCols);
  const offset = report.columns.length - cols.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[560px]">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 bg-surface px-5 py-2.5 text-left text-[12px] text-muted font-medium min-w-[240px]">Account</th>
            {cols.map((c) => (
              <th key={c.label} className="px-3 py-2.5 text-right text-[12px] text-muted font-medium whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.lines.map((l) =>
            l.kind === "spacer" ? (
              <tr key={l.id}>
                <td colSpan={cols.length + 1} className="h-3" />
              </tr>
            ) : (
              <tr key={l.id} className={cn(l.kind === "account" && "hover:bg-surface-2", (l.kind === "total" || l.kind === "grand") && "border-t border-line", l.kind === "grand" && "border-t-2 border-ink/70 bg-surface-2")}>
                <td className={cn("sticky left-0 bg-inherit py-1.5 pr-3 whitespace-nowrap", l.kind === "header" && l.depth === 0 && "pt-3 text-[12px] uppercase tracking-[0.08em] text-muted font-semibold", l.kind === "header" && l.depth > 0 && "font-medium text-ink-2 pt-2", (l.kind === "subtotal" || l.kind === "total") && "font-semibold", l.kind === "grand" && "font-semibold text-[14px] py-2.5")} style={{ paddingLeft: 20 + l.depth * 16 }}>
                  {l.accountId ? (
                    <Link href={`/books?account=${l.accountId}`} className="hover:text-brand-700 hover:underline">{l.label}</Link>
                  ) : (
                    l.label
                  )}
                </td>
                {l.kind !== "header" &&
                  cols.map((_, i) => (
                    <td key={i} className={cn("px-3 py-1.5 text-right tabular whitespace-nowrap", (l.kind === "subtotal" || l.kind === "total") && "font-semibold", l.kind === "grand" && "font-semibold text-[14px] py-2.5", l.values[offset + i]! < 0 && "text-ink-2")}>
                      {fmt(l.values[offset + i] ?? 0)}
                    </td>
                  ))}
                {l.kind === "header" && <td colSpan={cols.length} />}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ReportControls({ p }: { p: { kind: string; view: string; year: number; asOf: string; from: string; to: string } }) {
  const { set } = useQueryState();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Report"
        value={p.kind}
        onChange={(v) => set({ kind: v })}
        options={[
          { value: "pnl", label: "Profit & Loss" },
          { value: "balance_sheet", label: "Balance Sheet" },
          { value: "cash_flow", label: "Cash Flow" },
        ]}
      />
      {p.kind === "pnl" && (
        <>
          <Segmented size="sm" label="Columns" value={p.view} onChange={(v) => set({ view: v })} options={[{ value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" }]} />
          <Select aria-label="Year" value={String(p.year)} onChange={(e) => set({ year: e.target.value })} className="w-auto">
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </Select>
        </>
      )}
      {p.kind === "balance_sheet" && (
        <label className="flex items-center gap-2 text-[13px] text-muted whitespace-nowrap">
          As of
          <Input type="date" value={p.asOf} min="2025-01-01" onChange={(e) => e.target.value && set({ asOf: e.target.value })} className="w-auto" />
        </label>
      )}
      {p.kind === "cash_flow" && (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Input type="date" aria-label="From" value={p.from} min="2025-01-01" onChange={(e) => e.target.value && set({ from: e.target.value })} className="w-auto" />
          to
          <Input type="date" aria-label="To" value={p.to} onChange={(e) => e.target.value && set({ to: e.target.value })} className="w-auto" />
        </div>
      )}
    </div>
  );
}
