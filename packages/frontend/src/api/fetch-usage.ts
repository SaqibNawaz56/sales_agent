export interface Quota {
  limit: number | null;
  remaining: number | null;
  resetMs: number | null;
}

export interface BucketUsage {
  tokens: Quota;
  requests: Quota;
  audioSeconds: Quota;
  /** Epoch ms when the server last read these from a Groq response header. */
  observedAt: number | null;
  spentTokens: number;
  calls: number;
}

export interface Usage {
  chat: BucketUsage;
  transcription: BucketUsage;
  serverTime: number;
}

function quota(value: unknown): Quota {
  const q = (value ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  return {
    limit: n(q.limit),
    remaining: n(q.remaining),
    resetMs: n(q.resetMs),
  };
}

function bucket(value: unknown): BucketUsage {
  const b = (value ?? {}) as Record<string, unknown>;
  return {
    tokens: quota(b.tokens),
    requests: quota(b.requests),
    audioSeconds: quota(b.audioSeconds),
    observedAt: typeof b.observedAt === "number" ? b.observedAt : null,
    spentTokens: typeof b.spentTokens === "number" ? b.spentTokens : 0,
    calls: typeof b.calls === "number" ? b.calls : 0,
  };
}

/**
 * Reads the quota, and normalises whatever comes back.
 *
 * The normalising is not paranoia about our own endpoint — it is about what
 * failure here costs. UsageMeter renders inside the app tree with no error
 * boundary above it, so an unexpected shape throwing during render unmounts
 * everything, including a sale the owner was part-way through confirming. A
 * meter is not allowed to take the till down with it, so every field is coerced
 * to something renderable and a missing one becomes null rather than a crash.
 */
export async function fetchUsage(signal?: AbortSignal): Promise<Usage> {
  const response = await fetch("/api/usage", { signal });
  if (!response.ok) throw new Error(`Usage unavailable (${response.status})`);

  const raw = (await response.json()) as Record<string, unknown>;
  return {
    chat: bucket(raw.chat),
    transcription: bucket(raw.transcription),
    serverTime:
      typeof raw.serverTime === "number" ? raw.serverTime : Date.now(),
  };
}
