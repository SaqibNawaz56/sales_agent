import type { DraftSale } from "../draft";

/**
 * Enough to fetch the receipt for a sale that was just written.
 *
 * Present only on the turn that saved something. The client needs the id to
 * build the download URL, and the number so it can say which receipt it is
 * offering — "Receipt 003" rather than a bare link.
 */
export interface WrittenReceipt {
  saleId: number;
  receiptNo: number;
  /** ISO date, YYYY-MM-DD. */
  receiptDate: string;
}

export interface TurnResult {
  reply: string;
  draft: DraftSale | null;
  /** True when the draft is complete and only the owner's confirmation remains. */
  awaitingConfirmation: boolean;
  /** Set when the controller is waiting on an answer to a specific question. */
  question: string | null;
  /** Set only by a confirmation that actually wrote a sale. */
  receipt?: WrittenReceipt | null;
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
