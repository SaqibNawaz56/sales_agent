/**
 * The client's entire view of the server: two endpoints.
 *
 * All agent state lives server-side, keyed by session. The client holds a
 * transcript for display and nothing else — it never assembles a sale, never
 * computes a total, and cannot write.
 *
 * These interfaces mirror the API's response shape by hand rather than sharing
 * a package with it. The duplication is deliberate: the two are separate
 * deployables talking over HTTP, and a compile-time dependency between them
 * would make the wire format look editable from either side.
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

/**
 * One button offered alongside a question.
 *
 * The client renders `label` and sends `id` back untouched. It is deliberately
 * not told what a choice does — the server resolves the id against the question
 * it last issued, so the browser cannot invent an answer that was never
 * offered. `intent` is styling only.
 */
export interface AnswerChoice {
  id: string;
  label: string;
  intent: "affirm" | "reject" | "neutral";
}

export interface PendingQuestion {
  text: string;
  /** Empty when the question wants typing — an amount, a price, a name. */
  choices: AnswerChoice[];
}

/**
 * Where to get the receipt for a sale that was just written.
 *
 * Present only on a confirmation that actually saved something. The `url` is
 * built by the server, so the browser never has to know how receipt routes are
 * shaped — it follows a link it was handed, exactly as it echoes back a choice
 * id it was offered.
 */
export interface ReceiptRef {
  saleId: number;
  receiptNo: number;
  /** ISO date, YYYY-MM-DD. */
  receiptDate: string;
  url: string;
}

export interface ChatResponse {
  reply: string;
  draftSale: DraftSale | null;
  question: PendingQuestion | null;
  awaitingConfirmation: boolean;
  saved?: boolean;
  receipt?: ReceiptRef | null;
}
