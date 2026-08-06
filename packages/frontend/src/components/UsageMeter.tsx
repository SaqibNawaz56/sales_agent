import type { Usage } from "../api/fetch-usage";
import { formatDuration } from "../lib";
import { UsageBar } from "./UsageBar";

/**
 * The two Groq budgets, which bind at different timescales.
 *
 * TOKENS are the per-minute allowance and refill continuously — 12,000 a minute
 * is 200 a second, so a burst that empties the bucket is back to full within
 * seconds. This is what stops a fast demo mid-flow.
 *
 * REQUESTS are the daily allowance and refill at about one every 86 seconds.
 * At roughly one model call per sale it is the budget that decides how much
 * work a whole day holds, and unlike the token bucket it does not come back if
 * you simply wait a moment. Both are shown because knowing only the first tells
 * you nothing about the second.
 */
export function UsageMeter({ usage }: { usage: Usage | null }) {
  // Belt and braces with the normalising in fetchUsage. There is no error
  // boundary above this component, so anything it throws during render unmounts
  // the whole app — including a sale waiting to be confirmed.
  const chat = usage?.chat;
  if (!chat) return null;

  const hasReading = chat.tokens?.limit != null || chat.requests?.limit != null;
  if (!hasReading) {
    return (
      <span className="usage idle" title="No Groq call made yet this session">
        quota —
      </span>
    );
  }

  const ageMs = chat.observedAt
    ? Math.max(0, (usage?.serverTime ?? 0) - chat.observedAt)
    : null;

  const session =
    `This session: ${chat.calls} model calls, ` +
    `${chat.spentTokens.toLocaleString()} tokens` +
    (ageMs !== null ? `\nReading is ${formatDuration(ageMs)} old` : "");

  return (
    <span className="usage">
      <UsageBar
        label="min"
        quota={chat.tokens}
        unit="tokens"
        note={`Refills at 200 tokens/second. Running out pauses a sale for a few seconds.\n${session}`}
      />
      <UsageBar
        label="day"
        quota={chat.requests}
        unit="requests"
        note={`Roughly one call per sale. This one does not come back quickly.\n${session}`}
      />
    </span>
  );
}
