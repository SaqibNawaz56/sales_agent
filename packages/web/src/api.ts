/**
 * The client's entire view of the server: two endpoints.
 *
 * All agent state lives server-side, keyed by session. The client holds a
 * transcript for display and nothing else — it never assembles a sale, never
 * computes a total, and cannot write.
 */

export interface DraftItem {
  product: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface DraftSale {
  customer: string | null;
  status: "building" | "awaiting_confirmation";
  items: DraftItem[];
  grandTotal: number | null;
}

export interface ChatResponse {
  reply: string;
  draftSale: DraftSale | null;
  awaitingConfirmation: boolean;
  saved?: boolean;
}

async function postJson(path: string, body: unknown): Promise<ChatResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Surface the server's own wording where it gave one, since it is more
    // specific than anything generic invented here.
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

export function sendMessage(
  sessionId: string,
  message: string,
): Promise<ChatResponse> {
  return postJson("/api/chat", { sessionId, message });
}

/** The only call that can write a sale. */
export function resolveSale(
  sessionId: string,
  confirmed: boolean,
): Promise<ChatResponse> {
  return postJson("/api/sales/confirm", { sessionId, confirmed });
}
