import type { AnswerChoice } from "../draft";

/**
 * A price change the owner has been shown and not yet accepted.
 *
 * Held in the session exactly like a draft sale, and for the same reason: it
 * is a write, so it waits behind an explicit confirmation rather than
 * happening because a sentence was understood.
 */
export interface PendingPriceChange {
  productId: number;
  productName: string;
  unit: string;
  currentPrice: number;
  newPrice: number;
  question: string;
  choices: AnswerChoice[];
}

/** The MCP server's update_product_price response. */
export interface UpdatePriceResult {
  updated: boolean;
  reason?: string;
  product?: {
    id: number;
    name: string;
    unit: string;
    previousPrice: number;
    currentPrice: number;
  };
}
