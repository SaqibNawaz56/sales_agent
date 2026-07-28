import { ChatGroq } from "@langchain/groq";

export function createModel(): ChatGroq {
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
  });
}
