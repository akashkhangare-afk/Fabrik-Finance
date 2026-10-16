"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ForecastWeek } from "@/server/engines/forecast";
import { cn } from "@/lib/cn";
import { money, moneyCompact } from "@/lib/format";
import { prettyDate } from "@/lib/dates";
import { Badge, Card, CardHeader, Input } from "@/components/ui/primitives";
import { useQueryState } from "@/components/books/filters";

export function ForecastControls({ grain, buffer, includeEstimated }: { grain: number; buffer: number; includeEstimated: boolean }) {
  const { set } = useQueryState();
  const [g, setG] = useState(grain);
  return (
    <Card className="px-5 py-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
        <label className="flex-1">
          <div className="flex justify-between text-[13px]"><span className="font-medium">Seasonal sales vs. last year</span><span className="tabular text-muted">{g}%</span></div>
          <input type="range" min={0} max={120} step={5} value={g} onChange={(e) => setG(Number(e.target.value))} onMouseUp={() => set({ grain: String(g) })} onKeyUp={() => set({ grain: String(g) })} onTouchEnd={() => set({ grain: String(g) })} className="w-full accent-[var(--color-brand-600)] mt-2" aria-label="Seasonal sales as a percentage of last year" />
          <div className="text-[11.5px] text-muted mt-1">How much of last year&apos;s grain sales in these weeks you expect this year (the rest stays in storage).</div>
        </label>
        <label className="w-full lg:w-44">
          <div className="text-[13px] font-medium mb-1.5">Cash buffer ($)</div>
          <Input inputMode="numeric" defaultValue={String(buffer)} onBlur={(e) => set({ buffer: e.target.value.replace(/\D/g, "") || undefined })} aria-label="Minimum cash buffer in dollars" />
        </label>
        <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer select-none">
          <input type="checkbox" checked={includeEstimated} onChange={(e) => set({ est: e.target.checked ? undefined : "0" })} className="size-4 accent-[var(--color-brand-600)]" />
          Include estimated amounts
        </label>
      </div>
    </Card>
  );
}

export function ForecastWeeks({ weeks, buffer }: { weeks: ForecastWeek[]; buffer: number }) {
  const [open, setOpen] = useState<number | null>(1);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Week by week" subtitle="Expand a week to see every inflow and outflow and where it came from" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] text-muted text-left bg-surface-2 border-y border-line whitespace-nowrap">
              <th className="px-5 py-2 font-medium">Week</th>
              <th className="px-3 py-2 font-medium text-right">Opening</th>
              <th className="px-3 py-2 font-medium text-right">In · known</th>
              <th className="px-3 py-2 font-medium text-right">In · est.</th>
              <th className="px-3 py-2 font-medium text-right">Out · known</th>
              <th className="px-3 py-2 font-medium text-right">Out · est.</th>
              <th className="px-5 py-2 font-medium text-right">Closing</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <Fragment key={w.index}>
                <tr onClick={() => setOpen(open === w.index ? null : w.index)} className="border-b border-line hover:bg-surface-2 cursor-pointer" aria-expanded={open === w.index}>
                  <td className="px-5 py-2.5 whitespace-nowrap font-medium">
                    <ChevronRight className={cn("inline size-3.5 text-muted mr-1 transition", open === w.index && "rotate-90")} />
                    W{w.index} <span className="text-muted font-normal">· {w.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{moneyCompact(w.opening)}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ok-600">{w.inKnown ? `+${moneyCompact(w.inKnown)}` : "–"}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ok-600/80 italic">{w.inEstimated ? `+${moneyCompact(w.inEstimated)}` : "–"}</td>
                  <td className="px-3 py-2.5 text-right tabular">{w.outKnown ? `−${moneyCompact(w.outKnown)}` : "–"}</td>
                  <td className="px-3 py-2.5 text-right tabular italic text-ink-2">{w.outEstimated ? `−${moneyCompact(w.outEstimated)}` : "–"}</td>
                  <td className={cn("px-5 py-2.5 text-right tabular font-semibold", w.closing < buffer && "text-warn-700")}>{moneyCompact(w.closing)}</td>
                </tr>
                {open === w.index && (
                  <tr className="border-b border-line bg-surface-2/60">
                    <td colSpan={7} className="px-5 py-3">
                      {w.lines.length === 0 ? (
                        <div className="text-[12.5px] text-muted">No flows expected this week.</div>
                      ) : (
                        <ul className="space-y-1.5">
                          {w.lines.map((l) => (
                            <li key={l.id} className="flex items-center gap-3 text-[12.5px]">
                              <Badge tone={l.certainty === "known" ? "brand" : "neutral"} className={cn(l.certainty === "estimated" && "italic")}>{l.certainty}</Badge>
                              <span className="flex-1 min-w-0">
                                <span className="font-medium">{l.label}</span>
                                <span className="text-muted"> · {prettyDate(l.date)} · {l.source}</span>
                              </span>
                              <span className={cn("tabular font-medium whitespace-nowrap", l.direction === "in" ? "text-ok-600" : "text-ink")}>{l.direction === "in" ? "+" : "−"}{money(l.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
