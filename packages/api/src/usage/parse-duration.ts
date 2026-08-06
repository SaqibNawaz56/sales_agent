/**
 * Groq expresses rate-limit resets as human durations: "215ms", "7.66s",
 * "2m52.8s", occasionally "1h2m3s". Parsed to milliseconds.
 *
 * Returns null rather than 0 for anything unrecognised, so a format change
 * shows up in the UI as "unknown" instead of as a countdown that is already
 * finished — the second is a lie, the first is a prompt to look.
 */
export function parseDurationMs(value: string | null): number | null {
  if (!value) return null;

  const text = value.trim().toLowerCase();
  if (text === "") return null;

  const pattern = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;

  for (const [, amount, unit] of text.matchAll(pattern)) {
    matched = true;
    const n = Number(amount);
    if (unit === "ms") total += n;
    else if (unit === "s") total += n * 1000;
    else if (unit === "m") total += n * 60_000;
    else if (unit === "h") total += n * 3_600_000;
  }

  return matched ? Math.round(total) : null;
}
