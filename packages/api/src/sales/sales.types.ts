import type { DraftSale } from "../draft";

export interface TurnResult {
  reply: string;
  draft: DraftSale | null;
  /** True when the draft is complete and only the owner's confirmation remains. */
  awaitingConfirmation: boolean;
  /** Set when the controller is waiting on an answer to a specific question. */
  question: string | null;
}

/** The MCP server's save_sale response. */
export interface SaveSaleResult {
  saleId?: number;
  totalAmount?: number;
  customer?: { id: number; name: string };
  error?: string;
}

export const CONFIRM_PROMPT =
  "Confirm this sale? (/confirm to save, /cancel to discard)";
