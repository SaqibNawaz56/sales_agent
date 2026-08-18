import { sameFigures } from "../../src/narrator/same-figures";

/**
 * The local narrator, and the guard that makes it safe.
 *
 * narrate() reads its configuration at module load, so each behavioural test
 * sets the environment and re-requires the module. sameFigures is pure and is
 * tested directly — it is the part that decides whether a rewrite is allowed
 * anywhere near the owner.
 */

type Narrator = typeof import("../../src/narrator/narrate");

function loadNarrator(env: Record<string, string>): Narrator {
  jest.resetModules();
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  return require("../../src/narrator/narrate") as Narrator;
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function stubFetch(content: string, ok = true): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("sameFigures", () => {
  it("accepts a rewrite that keeps every figure", () => {
    expect(
      sameFigures(
        "On 2026-08-18 you made 2 sales totalling 4350.",
        "18-08-2026 کو آپ نے 2 فروخت کیں، کل 4350۔",
      ),
    ).toBe(true);
  });

  it("accepts a thousands separator, which is formatting", () => {
    expect(sameFigures("totalling 4350.", "totalling 4,350.")).toBe(true);
  });

  it("rejects a figure that changed", () => {
    // The failure this whole guard exists for.
    expect(sameFigures("totalling 4350.", "totalling 43500.")).toBe(false);
    expect(sameFigures("totalling 4350.", "totalling 435.")).toBe(false);
  });

  it("rejects a dropped figure", () => {
    expect(
      sameFigures("2 sales totalling 4350.", "some sales totalling 4350."),
    ).toBe(false);
  });

  it("rejects an invented figure", () => {
    expect(
      sameFigures("2 sales totalling 4350.", "2 sales totalling 4350, up 12%."),
    ).toBe(false);
  });

  it("ignores the order figures appear in", () => {
    // A translation may legitimately reorder the sentence.
    expect(sameFigures("2 sales, 4350 total", "total 4350, from 2 sales")).toBe(
      true,
    );
  });

  it("keeps decimals distinct", () => {
    expect(sameFigures("1.5 litre", "1.5 litre")).toBe(true);
    expect(sameFigures("1.5 litre", "15 litre")).toBe(false);
  });

  it("counts a repeated figure as two figures", () => {
    expect(sameFigures("2 kg at 2 each", "2 kg at 2 each")).toBe(true);
    expect(sameFigures("2 kg at 2 each", "2 kg at two each")).toBe(false);
  });
});

describe("narrate", () => {
  const ANSWER = "On 2026-08-18 you made 2 sales totalling 4350.";

  it("is off by default, and calls nothing", async () => {
    const fetchMock = stubFetch("anything");
    const { narrate, narratorEnabled } = loadNarrator({
      NARRATOR_URL: "",
      NARRATOR_LANGUAGE: "",
    });

    expect(narratorEnabled()).toBe(false);
    expect(await narrate(ANSWER)).toBe(ANSWER);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays off when a url is set but no language is", async () => {
    // Both are required: a running model with nothing to translate into is a
    // round trip that can only make the sentence worse.
    const fetchMock = stubFetch("anything");
    const { narratorEnabled } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "",
    });

    expect(narratorEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the rewrite when the figures survive", async () => {
    const urdu = "18-08-2026 کو آپ نے 2 فروخت کیں، کل 4350۔";
    stubFetch(urdu);
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
    });

    expect(await narrate(ANSWER)).toBe(urdu);
  });

  it("posts to the LOCAL url, never to a provider", async () => {
    const fetchMock = stubFetch("ok 2 4350 2026 08 18");
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
      NARRATOR_MODEL: "qwen2.5:3b",
    });

    await narrate(ANSWER);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe("qwen2.5:3b");
  });

  it("discards a rewrite that altered a figure", async () => {
    // The model returned fluent nonsense. The owner sees the correct sentence.
    stubFetch("On 2026-08-18 you made 2 sales totalling 43500.");
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
    });

    expect(await narrate(ANSWER)).toBe(ANSWER);
  });

  it("discards a rewrite that added a figure", async () => {
    stubFetch("On 2026-08-18 you made 2 sales totalling 4350, up 12% on Monday.");
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
    });

    expect(await narrate(ANSWER)).toBe(ANSWER);
  });

  it("falls back when the model is unreachable", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
    });

    expect(await narrate(ANSWER)).toBe(ANSWER);
  });

  it("falls back on a non-200", async () => {
    stubFetch("irrelevant", false);
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
    });

    expect(await narrate(ANSWER)).toBe(ANSWER);
  });

  it("falls back on an empty completion", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as unknown as typeof fetch;
    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
    });

    expect(await narrate(ANSWER)).toBe(ANSWER);
  });

  it("gives up rather than making the owner wait", async () => {
    // A local model on a modest laptop can take seconds. Past the timeout the
    // request is abandoned and the plain sentence is shown.
    global.fetch = jest.fn(
      (_url: unknown, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    ) as unknown as typeof fetch;

    const { narrate } = loadNarrator({
      NARRATOR_URL: "http://localhost:11434/v1",
      NARRATOR_LANGUAGE: "Urdu",
      NARRATOR_TIMEOUT_MS: "40",
    });

    expect(await narrate(ANSWER)).toBe(ANSWER);
  });
});
