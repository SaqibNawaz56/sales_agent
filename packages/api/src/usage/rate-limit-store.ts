import { parseDurationMs } from "./parse-duration";
import type { BucketUsage, UsageBucket, UsageSnapshot } from "./usage.types";

/**
 * What Groq last said about the remaining quota.
 *
 * These figures are read from the `x-ratelimit-*` response headers rather than
 * counted here, which matters: our own arithmetic would drift, would not know
 * about usage from another process sharing the key, and would have to guess at
 * the limit. Groq states all of it outright.
 *
 * Module-level state on purpose. It describes this process's view of one API
 * key, so there is exactly one of it, and nothing about it belongs to a request
 * or a session.
 *
 * Note the shape of what this can tell you: it is a reading taken at the moment
 * of the last call, not a live gauge. Between calls the bucket refills and this
 * store has no way to know. `observedAt` is therefore part of the payload, so
 * the UI can say how old the number is instead of implying it is current.
 */

function emptyBucket(): BucketUsage {
  return {
    tokens: { limit: null, remaining: null, resetMs: null },
    requests: { limit: null, remaining: null, resetMs: null },
    audioSeconds: { limit: null, remaining: null, resetMs: null },
    observedAt: null,
    spentTokens: 0,
    calls: 0,
  };
}

const buckets: UsageSnapshot = {
  chat: emptyBucket(),
  transcription: emptyBucket(),
};

function num(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads the rate-limit headers off a Groq response. Never throws. */
export function recordHeaders(bucket: UsageBucket, headers: Headers): void {
  const target = buckets[bucket];

  const tokens = {
    limit: num(headers, "x-ratelimit-limit-tokens"),
    remaining: num(headers, "x-ratelimit-remaining-tokens"),
    resetMs: parseDurationMs(headers.get("x-ratelimit-reset-tokens")),
  };
  const requests = {
    limit: num(headers, "x-ratelimit-limit-requests"),
    remaining: num(headers, "x-ratelimit-remaining-requests"),
    resetMs: parseDurationMs(headers.get("x-ratelimit-reset-requests")),
  };
  const audioSeconds = {
    limit: num(headers, "x-ratelimit-limit-audio-seconds"),
    remaining: num(headers, "x-ratelimit-remaining-audio-seconds"),
    resetMs: parseDurationMs(headers.get("x-ratelimit-reset-audio-seconds")),
  };

  // A response with none of these headers — an error page, a proxy — must not
  // wipe the last good reading.
  const sawAnything =
    tokens.limit !== null ||
    requests.limit !== null ||
    audioSeconds.limit !== null;
  if (!sawAnything) return;

  target.tokens = tokens;
  target.requests = requests;
  target.audioSeconds = audioSeconds;
  target.observedAt = Date.now();
}

/** Counts a call and, where known, the tokens it cost. */
export function recordCall(bucket: UsageBucket, tokens = 0): void {
  buckets[bucket].calls += 1;
  buckets[bucket].spentTokens += tokens;
}

export function usageSnapshot(): UsageSnapshot {
  // Structured-cloned so a caller cannot mutate the store by holding its object.
  return structuredClone(buckets);
}
