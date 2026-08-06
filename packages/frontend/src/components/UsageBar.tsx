import type { Quota } from "../api/fetch-usage";
import { compact, formatDuration, usageLevel } from "../lib";

/**
 * One budget: a label, a bar that fills as it is spent, and what is left.
 *
 * Returns null when the quota has no reading yet, so a budget Groq has not
 * reported on simply does not appear rather than showing a confident zero.
 */
export function UsageBar({
  label,
  quota,
  unit,
  note,
}: {
  /** Three characters or so — this sits in a header. */
  label: string;
  quota: Quota;
  /** Plural noun for the tooltip: "tokens", "requests". */
  unit: string;
  /** What running out actually costs. */
  note: string;
}) {
  if (quota.limit == null || quota.remaining == null || quota.limit <= 0) {
    return null;
  }

  const used = Math.max(0, quota.limit - quota.remaining);
  const fraction = Math.min(1, used / quota.limit);
  const level = usageLevel(fraction);

  const title = [
    `${used.toLocaleString()} of ${quota.limit.toLocaleString()} ${unit} used`,
    `${quota.remaining.toLocaleString()} left`,
    quota.resetMs != null ? `Back to full in ${formatDuration(quota.resetMs)}` : null,
    note,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span className={`usage-row ${level}`} title={title}>
      <span className="usage-label">{label}</span>
      <span className="usage-bar" aria-hidden="true">
        <span className="usage-fill" style={{ width: `${fraction * 100}%` }} />
      </span>
      <span className="usage-text">
        {compact(quota.remaining)}/{compact(quota.limit)}
      </span>
    </span>
  );
}
