import type { QueryRoute } from "../llm";
import type { ReceiptRef } from "../receipt";

export interface DailyTotalResult {
  date: string;
  sales: number;
  total: number;
}

export interface SalesByCustomerResult {
  found: boolean;
  customerName: string;
  sales: number;
  total: number;
}

export interface LastSaleItem {
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface LastSaleResult {
  /** False when there is no such customer. */
  found: boolean;
  customerName: string;
  /** False when the customer is on file but has never bought anything. */
  hasSale?: boolean;
  saleId?: number;
  receiptNo?: number;
  /** ISO date, YYYY-MM-DD. */
  date?: string;
  total?: number;
  items?: LastSaleItem[];
}

export interface SalesByProductResult {
  found: boolean;
  productName: string;
  unit?: string;
  quantity: number;
  revenue: number;
}

/**
 * What one query handler produces: the sentence, and anything to offer beside
 * it.
 *
 * Handlers used to return a bare string. The receipt is carried alongside the
 * text rather than mentioned in it because it is not language — the narrator
 * rewrites the sentence, and a URL inside that sentence would be one more thing
 * a rewrite could mangle.
 */
export interface AnswerParts {
  text: string;
  receipt?: ReceiptRef | null;
}

export interface QueryOutcome {
  answer: string;
  /** The exact text sent to the model. Inspected by the criterion 15 test. */
  outboundToModel: string;
  route: QueryRoute;
  /**
   * The receipt for the sale this answer describes, set only when the answer
   * describes exactly one. An aggregate over many sales — a daily total, a
   * customer's lifetime spend — has no single receipt to offer, so it is null.
   */
  receipt?: ReceiptRef | null;
}
