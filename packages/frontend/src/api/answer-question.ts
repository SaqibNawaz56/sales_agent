import type { ChatResponse } from "./api.types";
import { postJson } from "./post-json";

/**
 * Sends the id of a pressed answer button.
 *
 * Distinct from sendMessage because the server treats it differently: a typed
 * reply has to be interpreted by a model, whereas this is a choice the server
 * itself offered and therefore applies deterministically. Two of the answers
 * this endpoint carries end in a database write — adding a customer, and
 * opening the flow that adds a product.
 */
export function answerQuestion(
  sessionId: string,
  choiceId: string,
): Promise<ChatResponse> {
  return postJson("/api/answer", { sessionId, choiceId });
}
