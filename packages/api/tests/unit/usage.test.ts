import { parseDurationMs } from "../../src/usage/parse-duration";

/**
 * The Groq quota meter.
 *
 * rate-limit-store holds module-level state describing one API key, so each
 * test re-requires it for a clean reading rather than sharing one across the
 * file.
 */
type Store = typeof import("../../src/usage/rate-limit-store");

let store: Store;

beforeEach(() => {
  jest.resetModules();
  store = require("../../src/usage/rate-limit-store") as Store;
});

describe("parseDurationMs", () => {
  it.each([
    ["215ms", 215],
    ["7.66s", 7660],
    ["2m52.8s", 172800],
    ["1h2m3s", 3723000],
    ["1m", 60000],
  ])("parses %p", (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it("is case-insensitive and tolerates surrounding space", () => {
    expect(parseDurationMs("  7.66S ")).toBe(7660);
  });

  it.each([null, "", "   ", "soon", "unknown"])(
    "returns null rather than zero for %p",
    (input) => {
      // Null shows in the UI as "unknown". Zero would show as a countdown that
      // is already finished, which is a lie rather than a prompt to look.
      expect(parseDurationMs(input)).toBeNull();
    },
  );
});

describe("recordHeaders", () => {
  function headers(entries: Record<string, string>): Headers {
    return new Headers(entries);
  }

  it("reads the rate-limit headers Groq sends", () => {
    store.recordHeaders(
      "chat",
      headers({
        "x-ratelimit-limit-tokens": "12000",
        "x-ratelimit-remaining-tokens": "9500",
        "x-ratelimit-reset-tokens": "7.66s",
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "994",
        "x-ratelimit-reset-requests": "1m2s",
      }),
    );

    const snapshot = store.usageSnapshot();
    expect(snapshot.chat.tokens).toEqual({
      limit: 12000,
      remaining: 9500,
      resetMs: 7660,
    });
    expect(snapshot.chat.requests.resetMs).toBe(62000);
    expect(snapshot.chat.observedAt).not.toBeNull();
  });

  it("does not wipe the last good reading for a response with no headers", () => {
    store.recordHeaders(
      "chat",
      headers({
        "x-ratelimit-limit-tokens": "12000",
        "x-ratelimit-remaining-tokens": "9500",
      }),
    );
    // An error page, or a proxy that stripped them.
    store.recordHeaders("chat", headers({ "content-type": "text/html" }));

    expect(store.usageSnapshot().chat.tokens.remaining).toBe(9500);
  });

  it("ignores a non-numeric header value", () => {
    store.recordHeaders(
      "chat",
      headers({
        "x-ratelimit-limit-tokens": "12000",
        "x-ratelimit-remaining-tokens": "unavailable",
      }),
    );

    expect(store.usageSnapshot().chat.tokens.remaining).toBeNull();
  });

  it("keeps the two buckets apart", () => {
    store.recordHeaders(
      "transcription",
      headers({ "x-ratelimit-limit-audio-seconds": "7200" }),
    );

    const snapshot = store.usageSnapshot();
    expect(snapshot.transcription.audioSeconds.limit).toBe(7200);
    expect(snapshot.chat.audioSeconds.limit).toBeNull();
  });
});

describe("recordCall", () => {
  it("counts calls and the tokens they cost", () => {
    store.recordCall("chat", 800);
    store.recordCall("chat", 1200);

    const snapshot = store.usageSnapshot();
    expect(snapshot.chat.calls).toBe(2);
    expect(snapshot.chat.spentTokens).toBe(2000);
  });

  it("counts a call whose cost is unknown", () => {
    store.recordCall("chat");

    expect(store.usageSnapshot().chat.calls).toBe(1);
    expect(store.usageSnapshot().chat.spentTokens).toBe(0);
  });
});

describe("usageSnapshot", () => {
  it("cannot be mutated by a caller holding its object", () => {
    store.recordCall("chat", 800);
    const snapshot = store.usageSnapshot();
    snapshot.chat.spentTokens = 999_999;

    expect(store.usageSnapshot().chat.spentTokens).toBe(800);
  });

  it("starts empty", () => {
    const snapshot = store.usageSnapshot();

    expect(snapshot.chat.calls).toBe(0);
    expect(snapshot.chat.observedAt).toBeNull();
    expect(snapshot.chat.tokens.limit).toBeNull();
  });
});
