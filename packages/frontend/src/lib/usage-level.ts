export type UsageLevel = "ok" | "warn" | "critical";

/**
 * How alarmed to look, from the fraction of a budget already spent.
 *
 * The same thresholds serve both budgets even though running out means
 * different things: the per-minute token bucket refills in seconds, while the
 * daily request budget takes 86 seconds to return a single request. The colour
 * says "you are close to the edge"; which edge, and what it costs to cross it,
 * is what the label and tooltip are for.
 */
export function usageLevel(fraction: number): UsageLevel {
  if (fraction >= 0.85) return "critical";
  if (fraction >= 0.6) return "warn";
  return "ok";
}
