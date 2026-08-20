import type { AnswerChoice, DraftSale } from "../draft";
import type { ReceiptRef } from "../receipt";

export interface TurnResult {
  reply: string;
  draft: DraftSale | null;
  /** True when the draft is complete and only the owner's confirmation remains. */
  awaitingConfirmation: boolean;
  /** Set when the controller is waiting on an answer to a specific question. */
  question: string | null;
  /**
   * A receipt the owner may download, when this turn produced exactly one sale
   * to offer: a confirmation that wrote one, or an answer about a single past
   * sale. Null on every other turn, which is what clears a stale link.
   */
  receipt?: ReceiptRef | null;
  /**
   * A question that did not come from a draft sale — currently only the price
   * change confirmation. presentQuestion derives its output from the draft, and
   * a price change has no draft, so it is carried here instead.
   */
  pendingQuestion?: { text: string; choices: AnswerChoice[] } | null;
}

/** The MCP server's save_sale response. */
export interface SaveSaleResult {
  saleId?: number;
  totalAmount?: number;
  receiptNo?: number;
  receiptDate?: string;
  customer?: { id: number; name: string };
  error?: string;
}

export const CONFIRM_PROMPT =
  "Confirm this sale? (/confirm to save, /cancel to discard)";
