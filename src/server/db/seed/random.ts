/** Deterministic PRNG (mulberry32) so the demo environment is identical on every reset. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]!;
  }
  weighted<T>(xs: readonly (readonly [T, number])[]): T {
    const total = xs.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of xs) {
      r -= w;
      if (r <= 0) return v;
    }
    return xs[xs.length - 1]![0];
  }
  /** Splits `total` cents into n irregular positive parts that sum exactly to total. */
  partition(total: number, n: number, minPart = 500): number[] {
    if (n <= 1 || total < minPart * n) return [total];
    const ws = Array.from({ length: n }, () => 0.35 + this.next());
    const sum = ws.reduce((a, b) => a + b, 0);
    const parts = ws.map((w) => Math.max(minPart, Math.round((w / sum) * total)));
    const drift = total - parts.reduce((a, b) => a + b, 0);
    parts[parts.length - 1]! += drift;
    if (parts[parts.length - 1]! <= 0) return [total];
    return parts;
  }
}

let counter = 0;
export function resetSeedIds(): void {
  counter = 0;
}
export function sid(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36).padStart(6, "0")}`;
}
