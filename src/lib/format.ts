import type { Cents } from "./types";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-US");

/** $1,234 (whole dollars). Negative values render with a leading minus. */
export function money(cents: Cents, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const v = cents / 100;
  const s = (opts.decimals ? usd2 : usd0).format(Math.abs(v));
  if (v < 0) return `−${s}`;
  if (opts.sign && v > 0) return `+${s}`;
  return s;
}

/** $482K / $3.8M — for KPI-dense surfaces. */
export function moneyCompact(cents: Cents): string {
  const v = cents / 100;
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}K`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}$${Math.round(a)}`;
}

export function pct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function signedPct(ratio: number, digits = 1): string {
  const s = `${Math.abs(ratio * 100).toFixed(digits)}%`;
  return ratio > 0 ? `+${s}` : ratio < 0 ? `−${s}` : s;
}

export function count(n: number): string {
  return num.format(n);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Parses "$1,234.56", "1234", "-12.5" into cents. Returns null for invalid input. */
export function parseMoney(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
