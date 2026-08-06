/**
 * Milliseconds as something a person reads: "now", "8s", "2m 53s", "1h 12m".
 *
 * Both budgets refill continuously rather than resetting on a clock, so this
 * always answers "how long until it is full again", never "when does it reset".
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return "now";

  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}
