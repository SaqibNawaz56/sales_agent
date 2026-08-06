import type { ChatResponse } from "./api.types";

/**
 * The one place this client touches `fetch`.
 *
 * Both endpoints share it, so error handling is uniform: the server's own
 * wording wins where it gave one, since it is more specific than anything
 * generic invented here. The API normalises every failure to `{ error: string }`
 * for exactly this reason.
 */
export async function postJson(
  path: string,
  body: unknown,
): Promise<ChatResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) detail = payload.error;
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new Error(detail);
  }

  return (await response.json()) as ChatResponse;
}
