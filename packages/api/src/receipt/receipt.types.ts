/**
 * The shapes the receipt path deals in.
 *
 * SaleReceipt is what get_sale_receipt returns; ReceiptModel is what the
 * renderer draws. They are separate because the split is the testable seam:
 * everything about how a receipt reads — padding, money format, the filename —
 * lives in buildReceiptModel, which is a pure function, and the PDF renderer
 * only positions strings it is handed.
 */

export interface SaleReceiptItem {
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SaleReceipt {
  found: boolean;
  saleId?: number;
  receiptNo?: number;
  /** ISO date, YYYY-MM-DD. */
  receiptDate?: string;
  soldAt?: string;
  customer?: { id: number; name: string };
  totalAmount?: number;
  items?: SaleReceiptItem[];
}

export interface ReceiptLine {
  product: string;
  /** Quantity and unit together, as one column: "2 kg". */
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface ReceiptModel {
  /** Zero-padded for the printed receipt: 3 -> "003". */
  receiptNo: string;
  /** ISO, for the filename and for machines. */
  receiptDate: string;
  /** For a person to read: "10 Aug 2026, 12:21 UTC". */
  issuedAt: string;
  customer: string;
  /** The database identity, kept on the receipt so a query can find it again. */
  saleRef: string;
  lines: ReceiptLine[];
  grandTotal: string;
  /** What the browser saves it as. */
  filename: string;
}
