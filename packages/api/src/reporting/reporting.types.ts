import type { QueryRoute } from "../llm";

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

export interface QueryOutcome {
  answer: string;
  /** The exact text sent to the model. Inspected by the criterion 15 test. */
  outboundToModel: string;
  route: QueryRoute;
}
