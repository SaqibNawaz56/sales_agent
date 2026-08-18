import { sameFigures } from "./same-figures";

/**
 * Rewrites a finished answer through a LOCAL model, and never trusts it.
 *
 * WHERE THIS SITS. The read path assembles its answers from tool results in
 * application code — "On 2026-08-18 you made 2 sales totalling 4350." That
 * sentence is the source of truth and is what the owner sees if anything here
 * goes wrong. This function only ever polishes it: into better Urdu, or plainer
 * English, depending on NARRATOR_LANGUAGE.
 *
 * WHY LOCAL, AND WHY A SEPARATE CLIENT FROM llm/. By the time an answer exists
 * it contains a real customer name and real money — exactly what the
 * pseudonymisation in reporting/ exists to keep away from a remote model. So
 * this must not reach DeepSeek, and the way to guarantee that is not a comment
 * asking nobody to do it: it is a different directory, a different client, and
 * a different base URL that points at the machine the shop runs on. llm/ talks
 * to a provider with tokenised input; narrator/ talks to localhost with the
 * real thing. Neither can accidentally become the other.
 *
 * THREE WAYS IT DECLINES TO ACT, all returning the original sentence:
 *   - not configured, which is the default
 *   - slow, unreachable, or an error
 *   - a rewrite whose figures do not match the original's, exactly
 *
 * A bookkeeping answer that is plain but correct beats one that is fluent and
 * wrong, so every failure mode lands on the code-built sentence.
 */

/** Off unless a URL is set. The app must not depend on a model being installed. */
const URL_ = process.env.NARRATOR_URL ?? "";
const MODEL = process.env.NARRATOR_MODEL ?? "qwen2.5:3b";

/**
 * Blank means "leave the wording alone", which makes the narrator a no-op even
 * when a model is running. Set to "Urdu" for a shop that reads Urdu.
 */
const LANGUAGE = process.env.NARRATOR_LANGUAGE ?? "";

/**
 * A shopkeeper waiting on his own books will not wait long, and a local model
 * on a modest laptop can take seconds. Past this the original is shown and the
 * request is abandoned.
 */
const TIMEOUT_MS = Number(process.env.NARRATOR_TIMEOUT_MS ?? 4000);

export function narratorEnabled(): boolean {
  return URL_ !== "" && LANGUAGE !== "";
}

export async function narrate(answer: string): Promise<string> {
  if (!narratorEnabled()) return answer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${URL_}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: answer },
        ],
      }),
    });

    if (!response.ok) return answer;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rewritten = payload.choices?.[0]?.message?.content?.trim();

    if (!rewritten) return answer;

    // The guard that makes this safe at all. See same-figures.ts.
    if (!sameFigures(answer, rewritten)) return answer;

    return rewritten;
  } catch {
    // Aborted, unreachable, or malformed. The original sentence is already
    // correct, so there is nothing to report to the owner.
    return answer;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliberately narrow. The model is told it is rewriting, not answering — it
 * has no database access, no context beyond the sentence, and no reason to add
 * anything. The figure rule is stated even though sameFigures enforces it,
 * because a model that keeps the numbers is one whose output survives the check
 * and is actually used.
 */
function systemPrompt(): string {
  return `You rewrite one sentence from a shop's bookkeeping app into natural ${LANGUAGE}.

Rules:
- Keep every number exactly as written. Do not round, convert, recalculate or reformat any figure.
- Keep every product name and every person's name.
- Do not add information, opinions, greetings or advice. The sentence you are given is the whole truth.
- Reply with the rewritten sentence and nothing else.`;
}
