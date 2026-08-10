import PDFDocument from "pdfkit";

import type { ReceiptModel } from "./receipt.types";

/**
 * Draws the receipt. Positions strings; decides nothing.
 *
 * Every value here is already a finished string from buildReceiptModel, which
 * is what keeps the formatting rules testable — a wrong quantity format fails a
 * plain assertion rather than requiring someone to open a PDF.
 *
 * Buffered to a Buffer rather than piped straight to the response. A receipt is
 * a few kilobytes, and having the whole document before any of it is written
 * means a failure mid-render becomes a 502 with a readable message instead of a
 * truncated file the browser has already started saving.
 */

/** 80mm thermal-till width. A receipt should print on till paper. */
export const PAGE_WIDTH = 226;
export const MARGIN = 16;
export const CONTENT = PAGE_WIDTH - MARGIN * 2;

/**
 * 8pt for the item rows, not 9.
 *
 * 194pt of usable width has to hold a product name, a quantity with its unit,
 * a unit price and a line total. At 9pt the widest realistic row — something
 * like "Cooking Oil Large / 100.5 packet / 99999.00 / 99999.00" — needs 198pt
 * and does not fit. At 8pt it needs 176pt, which leaves room to breathe.
 */
export const BODY_SIZE = 8;
export const TOTAL_SIZE = 10;

/**
 * Column geometry, as explicit x/width pairs.
 *
 * The first version right-aligned each column inside a box that started at the
 * left margin, which meant the columns overlapped and their real widths were
 * implicit. A grand total of 1000.00 then wrapped to a second line — the amount
 * needed more room than the gap between the last two column edges allowed, and
 * nothing in the code said how much room that gap actually was.
 *
 * These are exported so a test can measure the widest string each column has to
 * hold against the width it is given, rather than that only showing up in a
 * printed receipt.
 */
export const COLUMNS = {
  product: { x: 0, width: 66 },
  quantity: { x: 66, width: 48 },
  price: { x: 114, width: 38 },
  total: { x: 152, width: 42 },
} as const;

/** The grand total gets its own, wider box — it is the biggest number here. */
export const TOTAL_ROW = {
  label: { x: 0, width: 116 },
  amount: { x: 116, width: 78 },
} as const;

export function renderReceiptPdf(model: ReceiptModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // A tall page trimmed to its content: `size` needs a height up front, and a
    // receipt's length depends on its line count.
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, 240 + model.lines.length * 14],
      margin: MARGIN,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const at = (column: { x: number; width: number }) => MARGIN + column.x;

    /** One row of the item table. */
    const row = (
      product: string,
      qty: string,
      price: string,
      total: string,
      y: number,
    ) => {
      doc.text(product, at(COLUMNS.product), y, {
        width: COLUMNS.product.width,
        ellipsis: true,
        lineBreak: false,
      });
      doc.text(qty, at(COLUMNS.quantity), y, {
        width: COLUMNS.quantity.width,
        align: "right",
        lineBreak: false,
      });
      doc.text(price, at(COLUMNS.price), y, {
        width: COLUMNS.price.width,
        align: "right",
        lineBreak: false,
      });
      doc.text(total, at(COLUMNS.total), y, {
        width: COLUMNS.total.width,
        align: "right",
        lineBreak: false,
      });
    };

    const rule = (y: number) => {
      doc
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + CONTENT, y)
        .lineWidth(0.5)
        .strokeColor("#999999")
        .stroke();
    };

    doc.fillColor("#000000");

    doc.font("Helvetica-Bold").fontSize(13);
    doc.text("HISAAB", MARGIN, MARGIN, {
      width: CONTENT,
      align: "center",
    });

    doc.font("Helvetica").fontSize(8);
    doc.text("Sales receipt", MARGIN, doc.y + 2, {
      width: CONTENT,
      align: "center",
    });

    let y = doc.y + 10;
    rule(y);
    y += 8;

    doc.fontSize(BODY_SIZE);
    const field = (label: string, value: string) => {
      doc.font("Helvetica").text(label, MARGIN, y, { width: 62 });
      doc
        .font("Helvetica-Bold")
        .text(value, MARGIN + 62, y, { width: CONTENT - 62 });
      y = doc.y + 3;
    };

    field("Receipt No.", model.receiptNo);
    field("Date", model.issuedAt);
    field("Customer", model.customer);

    y += 4;
    rule(y);
    y += 6;

    doc.font("Helvetica-Bold").fontSize(7.5);
    row("ITEM", "QTY", "PRICE", "TOTAL", y);
    y = doc.y + 4;
    rule(y);
    y += 5;

    doc.font("Helvetica").fontSize(BODY_SIZE);
    for (const line of model.lines) {
      row(line.product, line.quantity, line.unitPrice, line.lineTotal, y);
      y = doc.y + 4;
    }

    rule(y);
    y += 6;

    doc.font("Helvetica-Bold").fontSize(TOTAL_SIZE);
    doc.text("GRAND TOTAL", at(TOTAL_ROW.label), y, {
      width: TOTAL_ROW.label.width,
      lineBreak: false,
    });
    doc.text(model.grandTotal, at(TOTAL_ROW.amount), y, {
      width: TOTAL_ROW.amount.width,
      align: "right",
      lineBreak: false,
    });

    y = doc.y + 12;
    doc.font("Helvetica").fontSize(7).fillColor("#666666");
    doc.text(model.saleRef, MARGIN, y, { width: CONTENT, align: "center" });
    doc.text("Thank you", MARGIN, doc.y + 2, {
      width: CONTENT,
      align: "center",
    });

    doc.end();
  });
}
