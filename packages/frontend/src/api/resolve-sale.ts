import type { ChatResponse } from "./api.types";
import { postJson } from "./post-json";

/**
 * The only call in this client that can write a sale.
 *
 * It lives in a file of its own so the write path is a thing you can open,
 * rather than a branch inside a general-purpose request helper. `confirmed` is
 * always passed explicitly — the server rejects the request outright if the
 * flag is missing, and nothing here should ever supply a default for it.
 */
export function resolveSale(
  sessionId: string,
  confirmed: boolean,
): Promise<ChatResponse> {
  return postJson("/api/sales/confirm", { sessionId, confirmed });
}
