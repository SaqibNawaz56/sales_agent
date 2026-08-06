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
