import { ChatGroq } from "@langchain/groq";

import { observingFetch } from "../usage";
import { callbacksFor, usageCallbacks } from "./callbacks";

/**
 * The single place a model is constructed.
 *
 * Every prompt in the system goes through here, so the temperature, the retry
 * policy and the tracing hook are settings of the application rather than of
 * whichever call site happened to be written last.
 */
export function createModel(label = "model"): ChatGroq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to .env — the agent cannot start without it.",
    );
  }

  return new ChatGroq({
    apiKey,
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    // Extraction must be repeatable: the same sale sentence has to parse the
    // same way every time, and a demo that re-rolls its answer is not a demo.
    temperature: 0,
    // Groq's free tier allows 12,000 tokens per minute and an extraction costs
    // roughly 800, so a busy stretch — several sales with clarifications — can
    // trip a 429 mid-conversation. Retrying with backoff turns that from a
    // failed sale into a pause. This is the R6 mitigation the proposal names.
    maxRetries: 5,
    // Reads Groq's x-ratelimit-* headers as responses pass. LangChain drops
    // them from response_metadata, and this is the only seam that sees them.
    fetch: observingFetch("chat"),
    // Two sets: usage recording is always on, because the owner needs the meter
    // during a demo; console tracing stays behind AGENT_TRACE=1 because it is
    // noisy. See callbacks/.
    callbacks: [...usageCallbacks(), ...(callbacksFor(label) ?? [])],
  });
}
