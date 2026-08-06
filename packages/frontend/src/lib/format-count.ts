/** 11213 -> "11k", 4800 -> "4.8k", 998 -> "998". Header space is scarce. */
export function compact(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
