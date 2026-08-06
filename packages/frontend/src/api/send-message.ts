import type { ChatResponse } from "./api.types";
import { postJson } from "./post-json";

/** Everything except the write. */
export function sendMessage(
  sessionId: string,
  message: string,
): Promise<ChatResponse> {
  return postJson("/api/chat", { sessionId, message });
}
