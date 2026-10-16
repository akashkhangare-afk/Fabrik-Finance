import type { ISODate } from "./types";

/**
 * The demo clock. The seeded Smith Family Farms story is anchored to FABRIK_CLOCK (default
 * 2026-10-16) so the Expo demo is stable whenever it runs. Set FABRIK_CLOCK="" for real time.
 */
export function today(): ISODate {
  const anchored = process.env.FABRIK_CLOCK ?? "2026-10-16";
  if (anchored && /^\d{4}-\d{2}-\d{2}$/.test(anchored)) return anchored;
  return new Date().toISOString().slice(0, 10);
}

/** Current timestamp on the demo clock's date, keeping real wall-clock time of day. */
export function nowISO(): string {
  const real = new Date();
  const d = today();
  return `${d}T${real.toISOString().slice(11)}`;
}

export function parseDate(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function fmtDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmtDate(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

export function periodOf(d: ISODate): string {
  return d.slice(0, 7);
}

export function monthStart(period: string): ISODate {
  return `${period}-01`;
}

export function monthEnd(period: string): ISODate {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, "0")}`;
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(period: string, style: "short" | "long" = "short"): string {
  const d = parseDate(monthStart(period));
  return d.toLocaleDateString("en-US", { month: style, year: style === "long" ? "numeric" : "2-digit", timeZone: "UTC" });
}

export function monthName(period: string): string {
  return parseDate(monthStart(period)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

export function quarterOf(d: ISODate): { year: number; q: number } {
  const m = Number(d.slice(5, 7));
  return { year: Number(d.slice(0, 4)), q: Math.floor((m - 1) / 3) + 1 };
}

export function quarterRange(year: number, q: number): { from: ISODate; to: ISODate } {
  const startM = (q - 1) * 3 + 1;
  const from = `${year}-${String(startM).padStart(2, "0")}-01`;
  const to = monthEnd(`${year}-${String(startM + 2).padStart(2, "0")}`);
  return { from, to };
}

export function prettyDate(d: ISODate, opts: { year?: boolean } = {}): string {
  return parseDate(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function prettyDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

export function relativeAge(iso: string, ref: string = nowISO()): string {
  const ms = new Date(ref).getTime() - new Date(iso).getTime();
  const h = Math.max(0, Math.round(ms / 3_600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Monday on or after the given date. */
export function nextMonday(d: ISODate): ISODate {
  const x = parseDate(d);
  const dow = x.getUTCDay(); // 0 = Sun
  const delta = dow === 1 ? 7 : (8 - dow) % 7;
  return addDays(d, delta);
}

export function inRange(d: ISODate, from: ISODate, to: ISODate): boolean {
  return d >= from && d <= to;
}
