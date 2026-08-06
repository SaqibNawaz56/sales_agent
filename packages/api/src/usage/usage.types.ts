/** Which Groq quota a reading belongs to. The buckets are metered separately. */
export type UsageBucket = "chat" | "transcription";

export interface Quota {
  limit: number | null;
  remaining: number | null;
  /** Milliseconds until this bucket refills, as reported at observedAt. */
  resetMs: number | null;
}

export interface BucketUsage {
  tokens: Quota;
  requests: Quota;
  /** Whisper meters audio length rather than tokens; absent for chat. */
  audioSeconds: Quota;
  /** Epoch ms when these numbers were read from a response header. */
  observedAt: number | null;
  /** Cumulative tokens this process has spent on this bucket since boot. */
  spentTokens: number;
  /** Cumulative calls this process has made to this bucket since boot. */
  calls: number;
}

export type UsageSnapshot = Record<UsageBucket, BucketUsage>;
