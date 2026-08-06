import { recordCall, recordHeaders } from "../usage";
import { buildVocabularyPrompt } from "./vocabulary";

const GROQ_TRANSCRIPTION_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * whisper-large-v3, not the turbo variant.
 *
 * Turbo is cheaper and faster, and for a clean American accent the difference
 * is small. This is a Pakistani shopkeeper dictating product names in a noisy
 * shop, which is exactly the case where the larger model earns its latency.
 * Overridable so the trade can be revisited without a code change.
 */
const MODEL = process.env.GROQ_TRANSCRIBE_MODEL ?? "whisper-large-v3";

/**
 * ISO-639-1. Supplying it improves both accuracy and latency, because the model
 * is not spending its first tokens deciding what language it is hearing.
 * Set GROQ_TRANSCRIBE_LANGUAGE=ur for a shop that dictates in Urdu.
 */
const LANGUAGE = process.env.GROQ_TRANSCRIBE_LANGUAGE ?? "en";

interface GroqTranscription {
  text?: string;
  error?: { message?: string };
}

/**
 * Sends recorded audio to Groq's Whisper endpoint and returns the text.
 *
 * The audio never touches the model that runs the agent, and the transcript
 * goes back to the browser rather than into a draft — dictation fills the
 * composer, and the owner still presses Send. That keeps the rule this system
 * is built on: nothing enters a sale without a deliberate action.
 *
 * The Groq key lives here, in the API, and never in the browser bundle.
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
  form.append("model", MODEL);
  form.append("language", LANGUAGE);
  form.append("response_format", "json");
  // Deterministic: the same utterance must transcribe the same way twice, for
  // the same reason extraction runs at temperature 0.
  form.append("temperature", "0");

  try {
    form.append("prompt", await buildVocabularyPrompt());
  } catch {
    // A catalogue lookup failure must not cost the owner his dictation. Without
    // the hint the transcript is merely less accurate, which beats an error.
  }

  const response = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  // Whisper is metered in its own bucket — audio seconds rather than tokens —
  // so a busy afternoon of dictation cannot quietly eat the sale-capture
  // allowance, and the meter shows the two separately.
  recordHeaders("transcription", response.headers);
  recordCall("transcription");

  const payload = (await response.json()) as GroqTranscription;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Transcription failed (${response.status})`,
    );
  }

  return (payload.text ?? "").trim();
}
