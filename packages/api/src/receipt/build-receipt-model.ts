import type { ReceiptModel, SaleReceipt } from "./receipt.types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Money, as a receipt writes it.
 *
 * Always two decimals, even for a round number. The chat summary shows "800"
 * because it is prose; a receipt is a financial document and a column of
 * 600.00 / 200.00 / 800.00 is both scannable and unambiguous about precision.
 *
 * No currency symbol, because the shop's currency is nowhere in the schema and
 * printing a guessed one on a financial record would be worse than printing
 * none.
 */
export function money(value: number): string {
  return value.toFixed(2);
}

/**
 * A quantity without trailing zeros: 2 -> "2", 1.5 -> "1.5", 2.250 -> "2.25".
 *
 * quantity is DECIMAL(10,3) in the database, so "2.000 kg" is what a naive
 * format would print on every whole-number line.
 */
export function quantity(value: number, unit: string | null): string {
  const amount = String(Number(value.toFixed(3)));
  return unit ? `${amount} ${unit}` : amount;
}

/**
 * Formatted from UTC parts rather than via toLocaleString.
 *
 * Two reasons. The receipt date is a UTC day — that is how save_sale assigns it
 * and how query_daily_total buckets one — so displaying the time in the
 * container's local zone could print a date that disagrees with the receipt
 * number beside it. And a locale-dependent string makes the output a function
 * of the host, which is not something a test can pin.
 */
export function issuedAt(soldAtIso: string): string {
  const at = new Date(soldAtIso);
  const day = at.getUTCDate();
  const month = MONTHS[at.getUTCMonth()];
  const year = at.getUTCFullYear();
  const hours = String(at.getUTCHours()).padStart(2, "0");
  const minutes = String(at.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

/**
 * Turns one sale into everything the renderer needs, and nothing else.
 *
 * Pure, and deliberately the only place a decision about how a receipt reads is
 * made. The PDF renderer below it draws strings at coordinates; if it had to
 * decide how to format a quantity, that decision would only be reachable
 * through a binary file.
 */
export function buildReceiptModel(sale: SaleReceipt): ReceiptModel {
  if (
    !sale.found ||
    sale.saleId === undefined ||
    sale.receiptNo === undefined ||
    sale.receiptDate === undefined
  ) {
    throw new Error("Cannot build a receipt for a sale that was not found.");
  }

  const items = sale.items ?? [];

  return {
    // Three digits covers 999 sales in one day. A shop that passes that has
    // bigger problems than a wide receipt number, and padStart does not
    // truncate — 1000 simply prints as "1000".
    receiptNo: String(sale.receiptNo).padStart(3, "0"),
    receiptDate: sale.receiptDate,
    issuedAt: sale.soldAt ? issuedAt(sale.soldAt) : sale.receiptDate,
    customer: sale.customer?.name ?? "Unknown customer",
    saleRef: `Sale #${sale.saleId}`,
    lines: items.map((item) => ({
      product: item.productName,
      quantity: quantity(item.quantity, item.unit),
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
    })),
    // The stored total, not a re-sum of the lines. This figure is what the
    // shop's books say the customer owed; recomputing it here would mean a
    // receipt could quietly disagree with the sale it describes.
    grandTotal: money(sale.totalAmount ?? 0),
    filename: `receipt-${sale.receiptDate}-${String(sale.receiptNo).padStart(3, "0")}.pdf`,
  };
}
