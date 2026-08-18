import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { Runnable } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import type { z } from "zod";

import { callbacksFor } from "./callbacks";

/**
 * The single place a model is constructed.
 *
 * Every prompt in the system goes through here, so the temperature, the retry
 * policy and the tracing hook are settings of the application rather than of
 * whichever call site happened to be written last.
 *
 * DEEPSEEK, VIA THE OPENAI CLIENT. DeepSeek's API is OpenAI-compatible, so
 * ChatOpenAI with a base URL is the whole integration — no provider-specific
 * package, and one fewer dependency to track. That also means swapping
 * providers again later is a change to two environment variables rather than
 * to this file.
 *
 * WHY NOT GROQ ANY MORE. Groq retired llama-3.3-70b-versatile and every other
 * Llama model on this account, and the app returned 404 on every turn until it
 * was moved. Groq is still used for dictation — see transcription/, which posts
 * to Whisper — because DeepSeek has no audio endpoint at all. The two are
 * separate keys for separate jobs, and either can be absent without taking the
 * other down.
 */
export function createModel(label = "model"): ChatOpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Add it to .env — the agent cannot start without it.",
    );
  }

  return new ChatOpenAI({
    apiKey,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    },
    // Extraction must be repeatable: the same sale sentence has to parse the
    // same way every time, and a demo that re-rolls its answer is not a demo.
    temperature: 0,
    /*
     * THINKING MODE OFF. This is not a tuning preference — without it the app
     * does not work at all.
     *
     * DeepSeek's v4 models reason by default, and a thinking-mode request
     * rejects a forced tool_choice outright:
     *
     *   400 "Thinking mode does not support this tool_choice"
     *
     * Every prompt here goes through withStructuredOutput, which forces a tool
     * call to guarantee the shape — so every single turn would 400. Setting
     * reasoning_effort to "none" turns thinking off and forced tool calls work.
     *
     * It is also the right setting on the merits. These are narrow extraction
     * and routing prompts with a schema that admits one answer; there is
     * nothing to reason about, and reasoning tokens would be latency and cost
     * spent on a decision already constrained by the schema.
     *
     * Passed via modelKwargs because LangChain types reasoningEffort as
     * low | medium | high, and "none" is DeepSeek's own extension.
     */
    modelKwargs: { reasoning_effort: "none" },
    // A busy stretch — several sales with clarifications — can trip a rate
    // limit or a transient upstream error mid-conversation. Retrying with
    // backoff turns that from a failed sale into a pause. This is the R6
    // mitigation the proposal names.
    maxRetries: 5,
    // Console tracing only, behind AGENT_TRACE=1 because it is noisy. It is
    // also now the only place per-call token cost is visible: the header-based
    // quota meter is gone, since DeepSeek sends no rate-limit headers for it to
    // read. See callbacks/.
    callbacks: callbacksFor(label) ?? [],
  });
}

/**
 * A model bound to an output schema. Every prompt in the system uses this.
 *
 * The reason it exists rather than each call site calling withStructuredOutput
 * itself is the `method` below. LangChain picks a strategy automatically, and
 * on an OpenAI-shaped client it now prefers `json_schema` response format —
 * which DeepSeek answers with:
 *
 *   400 "This response_format type is unavailable now"
 *
 * Naming functionCalling explicitly pins the one mechanism DeepSeek does
 * support. Centralising it means a prompt added later cannot quietly pick the
 * default and fail, and there is exactly one line to change if a future
 * provider prefers the other route.
 */
export function createStructuredModel<Schema extends z.ZodTypeAny>(
  schema: Schema,
  name: string,
  label = "model",
): Runnable<BaseLanguageModelInput, z.infer<Schema>> {
  return createModel(label).withStructuredOutput(schema, {
    name,
    method: "functionCalling",
  }) as Runnable<BaseLanguageModelInput, z.infer<Schema>>;
}
