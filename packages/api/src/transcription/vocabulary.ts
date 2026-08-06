import { callServerTool } from "../mcp";

interface ListProductsResult {
  products: Array<{ id: number; name: string; unit: string }>;
}

interface ListCustomersResult {
  customers: Array<{ id: number; name: string }>;
}

/** Whisper caps the biasing prompt at 224 tokens; stay well inside it. */
const MAX_PROMPT_CHARS = 600;

/**
 * The shop's own words, as a hint for the transcriber.
 *
 * This is the whole reason dictation moved off the browser's Web Speech API.
 * That API transcribes against a generic model with no way to tell it what this
 * shop sells or who its customers are, so "Zaffran" and "saqibali" were never
 * going to survive it. Whisper accepts a `prompt` that biases spelling toward
 * the words in it, and the shop already holds the exact list — the catalogue
 * and the customer table.
 *
 * Names are truncated rather than sampled at random so the hint is stable
 * between utterances; a prompt that changes shape every time makes transcription
 * inconsistent in a way that is very hard to debug.
 */
export async function buildVocabularyPrompt(): Promise<string> {
  const [products, customers] = await Promise.all([
    callServerTool<ListProductsResult>("list_products", {}),
    callServerTool<ListCustomersResult>("list_customers", {}),
  ]);

  const productNames = products.products.map((p) => p.name);
  const customerNames = customers.customers.map((c) => c.name);

  // Phrased as a sentence rather than a bare list: Whisper's prompt is treated
  // as preceding transcript, so prose primes it better than CSV does.
  const hint =
    `A shopkeeper recording a sale. Products: ${productNames.join(", ")}. ` +
    `Customers: ${customerNames.join(", ")}. ` +
    `Units: kg, gram, litre, ml, dozen, packet, piece, bottle.`;

  return hint.length > MAX_PROMPT_CHARS
    ? `${hint.slice(0, MAX_PROMPT_CHARS - 1)}.`
    : hint;
}
