import type { Cents, ISODate } from "@/lib/types";
import { addDays, prettyDate } from "@/lib/dates";

/**
 * 13-week cash-flow forecast (Expo PRD §19).
 *
 * Every line is tagged `known` (amount comes from a document or contract: open invoices, approved
 * bills, payroll, debt schedules) or `estimated` (derived from history: seasonal grain sales, variable
 * input spend, card spending). Assumptions are returned alongside the numbers so users can inspect
 * and adjust them.
 */

export type ForecastCategory = "collections" | "grain_sales" | "bills" | "payroll" | "debt_service" | "recurring" | "variable" | "card" | "owner" | "scenario";

export interface ForecastLine {
  id: string;
  label: string;
  category: ForecastCategory;
  direction: "in" | "out";
  certainty: "known" | "estimated";
  date: ISODate;
  amount: Cents; // always positive; direction gives the sign
  source: string;
  href?: string;
}

export interface ForecastWeek {
  index: number;
  start: ISODate;
  end: ISODate;
  label: string;
  opening: Cents;
  inKnown: Cents;
  inEstimated: Cents;
  outKnown: Cents;
  outEstimated: Cents;
  closing: Cents;
  lines: ForecastLine[];
}

export interface Assumption {
  key: string;
  label: string;
  value: string;
  basis: string;
}

export interface ForecastInput {
  today: ISODate;
  startingCash: Cents;
  lines: ForecastLine[];
  assumptions: Assumption[];
  bufferCents: Cents;
}

export interface Forecast {
  asOf: ISODate;
  startingCash: Cents;
  weeks: ForecastWeek[];
  endingCash: Cents;
  minCash: Cents;
  minWeek: number;
  bufferCents: Cents;
  weeksBelowBuffer: number[];
  totals: { inKnown: Cents; inEstimated: Cents; outKnown: Cents; outEstimated: Cents };
  assumptions: Assumption[];
  excluded: { label: string; amount: Cents; reason: string }[];
}

export const FORECAST_WEEKS = 13;

export function weekWindows(today: ISODate): { start: ISODate; end: ISODate }[] {
  const first = addDays(today, 1);
  return Array.from({ length: FORECAST_WEEKS }, (_, i) => ({ start: addDays(first, i * 7), end: addDays(first, i * 7 + 6) }));
}

export function buildForecast(input: ForecastInput, excluded: Forecast["excluded"] = []): Forecast {
  const windows = weekWindows(input.today);
  let bal = input.startingCash;
  const weeks: ForecastWeek[] = windows.map((w, i) => {
    const lines = input.lines.filter((l) => l.date >= w.start && l.date <= w.end).sort((a, b) => b.amount - a.amount);
    const sum = (dir: "in" | "out", c: "known" | "estimated") => lines.filter((l) => l.direction === dir && l.certainty === c).reduce((s, l) => s + l.amount, 0);
    const week: ForecastWeek = {
      index: i + 1,
      start: w.start,
      end: w.end,
      label: `${prettyDate(w.start)}–${prettyDate(w.end)}`,
      opening: bal,
      inKnown: sum("in", "known"),
      inEstimated: sum("in", "estimated"),
      outKnown: sum("out", "known"),
      outEstimated: sum("out", "estimated"),
      closing: 0,
      lines,
    };
    bal = bal + week.inKnown + week.inEstimated - week.outKnown - week.outEstimated;
    week.closing = bal;
    return week;
  });
  const min = weeks.reduce((m, w) => (w.closing < m.closing ? w : m), weeks[0]!);
  return {
    asOf: input.today,
    startingCash: input.startingCash,
    weeks,
    endingCash: weeks.at(-1)!.closing,
    minCash: min.closing,
    minWeek: min.index,
    bufferCents: input.bufferCents,
    weeksBelowBuffer: weeks.filter((w) => w.closing < input.bufferCents).map((w) => w.index),
    totals: weeks.reduce((t, w) => ({ inKnown: t.inKnown + w.inKnown, inEstimated: t.inEstimated + w.inEstimated, outKnown: t.outKnown + w.outKnown, outEstimated: t.outEstimated + w.outEstimated }), { inKnown: 0, inEstimated: 0, outKnown: 0, outEstimated: 0 }),
    assumptions: input.assumptions,
    excluded,
  };
}

/** Level-payment amortization: payment per period. */
export function amortizedPayment(principal: Cents, annualRatePct: number, years: number, periodsPerYear = 12): Cents {
  const r = annualRatePct / 100 / periodsPerYear;
  const n = years * periodsPerYear;
  if (r === 0) return Math.round(principal / n);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
}
