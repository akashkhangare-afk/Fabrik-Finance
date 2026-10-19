"use client";

import { useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { cn } from "@/lib/cn";
import { moneyCompact } from "@/lib/format";
import { Segmented } from "@/components/ui/client";

// Validated with the dataviz palette validator (all-pairs, light surface).
export const SERIES = { s1: "#1f7a55", s2: "#e8913a", s3: "#2a78d6", muted: "#8b918c", grid: "#ecebe6", axis: "#8b918c" };

const axisTick = { fill: SERIES.axis, fontSize: 11.5 };
const fmtAxis = (v: number) => moneyCompact(v);

function TooltipShell({ title, rows }: { title: string; rows: { label: string; value: string; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-[var(--shadow-pop)] min-w-[180px]">
      <div className="text-[12px] text-muted mb-1.5">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 text-[12.5px]">
            {r.color && <span className="w-3 h-0 border-t-2" style={{ borderColor: r.color, borderStyle: r.dashed ? "dashed" : "solid" }} />}
            <span className="font-semibold tabular text-ink">{r.value}</span>
            <span className="text-muted">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: "bar" | "line" | "hatch" | "dashed" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.kind === "line" || i.kind === "dashed" ? (
            <span className="w-4 h-0 border-t-2" style={{ borderColor: i.color, borderStyle: i.kind === "dashed" ? "dashed" : "solid" }} />
          ) : (
            <span className={cn("size-2.5 rounded-[3px]", i.kind === "hatch" && "hatch")} style={i.kind === "hatch" ? { color: i.color, border: `1px solid ${i.color}` } : { background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ─── Revenue vs expenses ─────────────────────────────────────────────────────

export interface MonthPoint {
  period: string;
  label: string;
  revenue: number;
  expenses: number;
  net: number;
  partial?: boolean;
}

export function RevenueExpenseChart({ series, ranges, defaultRange = "12m", height = 260 }: { series: Record<string, MonthPoint[]>; ranges: { value: string; label: string }[]; defaultRange?: string; height?: number }) {
  const [range, setRange] = useState(defaultRange);
  const data = series[range] ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Legend items={[{ label: "Revenue", color: SERIES.s1 }, { label: "Expenses", color: SERIES.s2 }]} />
        {ranges.length > 1 && <Segmented size="sm" label="Period" value={range} onChange={setRange} options={ranges} />}
      </div>
      <div style={{ height }} role="img" aria-label={`Revenue and expenses by month, ${ranges.find((r) => r.value === range)?.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={SERIES.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: SERIES.grid }} tick={axisTick} />
            <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} tick={axisTick} width={56} />
            <ReferenceLine y={0} stroke="#d4d3cb" />
            <Tooltip
              cursor={{ fill: "rgba(22,26,23,0.04)" }}
              content={(p: TooltipContentProps<ValueType, NameType>) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0]!.payload as MonthPoint;
                return <TooltipShell title={`${d.label}${d.partial ? " (month to date)" : ""}`} rows={[{ label: "Revenue", value: moneyCompact(d.revenue), color: SERIES.s1 }, { label: "Expenses", value: moneyCompact(d.expenses), color: SERIES.s2 }]} />;
              }}
            />
            <Bar isAnimationActive={false} dataKey="revenue" fill={SERIES.s1} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar isAnimationActive={false} dataKey="expenses" fill={SERIES.s2} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── 13-week forecast ────────────────────────────────────────────────────────

export interface WeekPoint {
  label: string;
  range: string;
  closing: number;
  inKnown: number;
  inEstimated: number;
  outKnown: number;
  outEstimated: number;
}

export function ForecastChart({ weeks, buffer, startingCash, height = 280, compact }: { weeks: WeekPoint[]; buffer: number; startingCash: number; height?: number; compact?: boolean }) {
  const data = [{ label: "Now", range: "Today", closing: startingCash, inKnown: 0, inEstimated: 0, outKnown: 0, outEstimated: 0 }, ...weeks].map((w) => ({ ...w, outKnownNeg: -w.outKnown, outEstNeg: -w.outEstimated }));
  return (
    <div>
      {!compact && (
        <div className="mb-3">
          <Legend items={[{ label: "Projected cash balance", color: SERIES.s3, kind: "line" }, { label: "Inflows – known", color: SERIES.s1 }, { label: "Inflows – estimated", color: SERIES.s1, kind: "hatch" }, { label: "Outflows – known", color: SERIES.s2 }, { label: "Outflows – estimated", color: SERIES.s2, kind: "hatch" }, { label: "Cash buffer", color: SERIES.muted, kind: "dashed" }]} />
        </div>
      )}
      <div style={{ height }} role="img" aria-label="13-week cash forecast">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} stackOffset="sign" barCategoryGap="30%">
            <defs>
              <pattern id="hatch-in" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="#e3f0e9" />
                <line x1="0" y1="0" x2="0" y2="5" stroke={SERIES.s1} strokeWidth="1.6" />
              </pattern>
              <pattern id="hatch-out" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
                <rect width="5" height="5" fill="#fbeedf" />
                <line x1="0" y1="0" x2="0" y2="5" stroke={SERIES.s2} strokeWidth="1.6" />
              </pattern>
              <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.s3} stopOpacity={0.12} />
                <stop offset="100%" stopColor={SERIES.s3} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={SERIES.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: SERIES.grid }} tick={axisTick} interval={compact ? 2 : 0} />
            <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} tick={axisTick} width={56} />
            <ReferenceLine y={0} stroke="#d4d3cb" />
            <ReferenceLine y={buffer} stroke={SERIES.muted} strokeDasharray="5 4" label={compact ? undefined : { value: `Buffer ${moneyCompact(buffer)}`, position: "insideTopLeft", fill: "#646b66", fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: "#d4d3cb", strokeWidth: 1 }}
              content={(p: TooltipContentProps<ValueType, NameType>) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0]!.payload as WeekPoint;
                return (
                  <TooltipShell
                    title={`${d.label === "Now" ? "Today" : `Week ${d.label.replace("W", "")}`} · ${d.range}`}
                    rows={[
                      { label: "Closing cash", value: moneyCompact(d.closing), color: SERIES.s3 },
                      { label: "In – known", value: moneyCompact(d.inKnown), color: SERIES.s1 },
                      { label: "In – estimated", value: moneyCompact(d.inEstimated), color: SERIES.s1, dashed: true },
                      { label: "Out – known", value: moneyCompact(d.outKnown), color: SERIES.s2 },
                      { label: "Out – estimated", value: moneyCompact(d.outEstimated), color: SERIES.s2, dashed: true },
                    ]}
                  />
                );
              }}
            />
            {!compact && (
              <>
                <Bar isAnimationActive={false} dataKey="inKnown" stackId="flow" fill={SERIES.s1} maxBarSize={18} />
                <Bar isAnimationActive={false} dataKey="inEstimated" stackId="flow" fill="url(#hatch-in)" stroke={SERIES.s1} strokeWidth={0.75} maxBarSize={18} radius={[4, 4, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="outKnownNeg" stackId="flow" fill={SERIES.s2} maxBarSize={18} />
                <Bar isAnimationActive={false} dataKey="outEstNeg" stackId="flow" fill="url(#hatch-out)" stroke={SERIES.s2} strokeWidth={0.75} maxBarSize={18} radius={[0, 0, 4, 4]} />
              </>
            )}
            <Area isAnimationActive={false} dataKey="closing" stroke="none" fill="url(#bal)" type="monotone" />
            <Line isAnimationActive={false} dataKey="closing" stroke={SERIES.s3} strokeWidth={2} type="monotone" dot={compact ? false : { r: 3.5, fill: SERIES.s3, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Scenario comparison ─────────────────────────────────────────────────────

export function ScenarioChart({ data, buffer, height = 240 }: { data: { label: string; range: string; baseline: number; scenario: number }[]; buffer: number; height?: number }) {
  return (
    <div>
      <div className="mb-3">
        <Legend items={[{ label: "Baseline", color: SERIES.muted, kind: "line" }, { label: "With scenario", color: SERIES.s3, kind: "line" }, { label: "Cash buffer", color: SERIES.muted, kind: "dashed" }]} />
      </div>
      <div style={{ height }} role="img" aria-label="Projected cash: baseline versus scenario">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={SERIES.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: SERIES.grid }} tick={axisTick} />
            <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} tick={axisTick} width={56} />
            <ReferenceLine y={0} stroke="#d4d3cb" />
            <ReferenceLine y={buffer} stroke={SERIES.muted} strokeDasharray="5 4" />
            <Tooltip
              cursor={{ stroke: "#d4d3cb" }}
              content={(p: TooltipContentProps<ValueType, NameType>) => {
                if (!p.active || !p.payload?.length) return null;
                const d = p.payload[0]!.payload as { label: string; range: string; baseline: number; scenario: number };
                return <TooltipShell title={`Week ${d.label.replace("W", "")} · ${d.range}`} rows={[{ label: "With scenario", value: moneyCompact(d.scenario), color: SERIES.s3 }, { label: "Baseline", value: moneyCompact(d.baseline), color: SERIES.muted }, { label: "Difference", value: moneyCompact(d.scenario - d.baseline) }]} />;
              }}
            />
            <Line isAnimationActive={false} dataKey="baseline" stroke={SERIES.muted} strokeWidth={2} type="monotone" dot={false} />
            <Line isAnimationActive={false} dataKey="scenario" stroke={SERIES.s3} strokeWidth={2} type="monotone" dot={{ r: 3.5, fill: SERIES.s3, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── AR aging buckets ────────────────────────────────────────────────────────

export function AgingBuckets({ buckets }: { buckets: { label: string; value: number; tone: "ok" | "warn" | "risk" | "crit" }[] }) {
  const color = { ok: SERIES.s1, warn: "#e9b949", risk: SERIES.s2, crit: "#c2452f" };
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {buckets.map((b) => (
          <div key={b.label}>
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="size-2.5 rounded-[3px]" style={{ background: color[b.tone] }} />
              {b.label}
            </div>
            <div className="text-[15px] font-semibold tabular mt-0.5">{moneyCompact(b.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = SERIES.s3, height = 36 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 120;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - 3 - ((v - min) / (max - min || 1)) * (height - 6)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} aria-hidden preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
