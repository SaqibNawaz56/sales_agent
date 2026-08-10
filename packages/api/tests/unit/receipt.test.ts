jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));

import PDFDocument from "pdfkit";

import {
  BODY_SIZE,
  COLUMNS,
  CONTENT,
  TOTAL_ROW,
  TOTAL_SIZE,
  buildReceiptModel,
  fetchReceipt,
  issuedAt,
  money,
  quantity,
  renderReceiptPdf,
  type SaleReceipt,
} from "../../src/receipt";
import { callServerTool } from "../../src/mcp";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;

function saleReceipt(overrides: Partial<SaleReceipt> = {}): SaleReceipt {
  return {
    found: true,
    saleId: 46,
    receiptNo: 3,
    receiptDate: "2026-08-10",
    soldAt: "2026-08-10T12:21:53.885Z",
    customer: { id: 7, name: "Ali" },
    totalAmount: 800,
    items: [
      {
        productId: 1,
        productName: "Rice",
        unit: "kg",
        quantity: 2,
        unitPrice: 300,
        lineTotal: 600,
      },
      {
        productId: 2,
        productName: "Sugar",
        unit: "kg",
        quantity: 2,
        unitPrice: 100,
        lineTotal: 200,
      },
    ],
    ...overrides,
  };
}

/**
 * The receipt.
 *
 * Everything about how a receipt reads lives in buildReceiptModel, which is
 * pure, so it is asserted here as plain strings. renderReceiptPdf only
 * positions what it is handed — a formatting bug should fail an equality check,
 * not require someone to open a binary.
 */

describe("money", () => {
  it("always shows two decimals, even for a round figure", () => {
    // A financial document, not prose. The chat summary says "800"; a receipt
    // column says 800.00.
    expect(money(800)).toBe("800.00");
    expect(money(0)).toBe("0.00");
  });

  it("keeps the paise", () => {
    expect(money(1234.5)).toBe("1234.50");
    expect(money(99.99)).toBe("99.99");
  });
});

describe("quantity", () => {
  it("drops the trailing zeros a DECIMAL(10,3) column carries", () => {
    // Without this every whole-number line reads "2.000 kg".
    expect(quantity(2, "kg")).toBe("2 kg");
  });

  it("keeps a genuine fraction", () => {
    expect(quantity(1.5, "litre")).toBe("1.5 litre");
    expect(quantity(2.25, "kg")).toBe("2.25 kg");
  });

  it("omits the unit when there is none", () => {
    expect(quantity(3, null)).toBe("3");
  });
});

describe("issuedAt", () => {
  it("formats from UTC parts, whatever the container's timezone", () => {
    // The receipt date is a UTC day. A locally-formatted time could print a
    // date that disagrees with the receipt number printed beside it.
    expect(issuedAt("2026-08-10T12:21:53.885Z")).toBe(
      "10 Aug 2026, 12:21 UTC",
    );
  });

  it("pads the clock", () => {
    expect(issuedAt("2026-01-05T09:07:00.000Z")).toBe("5 Jan 2026, 09:07 UTC");
  });

  it("does not roll a late-evening sale into the next day", () => {
    expect(issuedAt("2026-08-10T23:59:00.000Z")).toBe(
      "10 Aug 2026, 23:59 UTC",
    );
  });
});

describe("buildReceiptModel", () => {
  it("carries the customer, the number, the lines and the total", () => {
    const model = buildReceiptModel(saleReceipt());

    expect(model.customer).toBe("Ali");
    expect(model.receiptNo).toBe("003");
    expect(model.receiptDate).toBe("2026-08-10");
    expect(model.saleRef).toBe("Sale #46");
    expect(model.grandTotal).toBe("800.00");
    expect(model.lines).toEqual([
      { product: "Rice", quantity: "2 kg", unitPrice: "300.00", lineTotal: "600.00" },
      { product: "Sugar", quantity: "2 kg", unitPrice: "100.00", lineTotal: "200.00" },
    ]);
  });

  it("zero-pads the receipt number to three digits", () => {
    expect(buildReceiptModel(saleReceipt({ receiptNo: 1 })).receiptNo).toBe("001");
    expect(buildReceiptModel(saleReceipt({ receiptNo: 42 })).receiptNo).toBe("042");
  });

  it("does not truncate a number past three digits", () => {
    expect(buildReceiptModel(saleReceipt({ receiptNo: 1000 })).receiptNo).toBe(
      "1000",
    );
  });

  it("names the file by date and number, so two receipts never collide", () => {
    expect(buildReceiptModel(saleReceipt()).filename).toBe(
      "receipt-2026-08-10-003.pdf",
    );
  });

  it("uses the stored total rather than re-summing the lines", () => {
    // A receipt that recomputed its own total could quietly disagree with the
    // sale it describes. If those two ever diverge, the receipt should show
    // what the books show.
    const model = buildReceiptModel(saleReceipt({ totalAmount: 750 }));

    expect(model.grandTotal).toBe("750.00");
  });

  it("falls back to the date when there is no timestamp", () => {
    const model = buildReceiptModel(saleReceipt({ soldAt: undefined }));

    expect(model.issuedAt).toBe("2026-08-10");
  });

  it("names an absent customer rather than printing nothing", () => {
    const model = buildReceiptModel(saleReceipt({ customer: undefined }));

    expect(model.customer).toBe("Unknown customer");
  });

  it("handles a single-line sale", () => {
    const model = buildReceiptModel(
      saleReceipt({
        items: [
          {
            productId: 1,
            productName: "Rice",
            unit: "kg",
            quantity: 2,
            unitPrice: 300,
            lineTotal: 600,
          },
        ],
        totalAmount: 600,
      }),
    );

    expect(model.lines).toHaveLength(1);
    expect(model.grandTotal).toBe("600.00");
  });

  it("refuses to build a receipt for a sale that was not found", () => {
    expect(() => buildReceiptModel({ found: false })).toThrow(/not found/i);
  });

  it("refuses a sale carrying no receipt number", () => {
    // Every sale has had one since the migration; this is the guard that keeps
    // a half-populated row from producing a receipt numbered "undefined".
    expect(() =>
      buildReceiptModel(saleReceipt({ receiptNo: undefined })),
    ).toThrow(/not found/i);
  });
});

describe("fetchReceipt", () => {
  it("reads the sale through the controller's own MCP client", async () => {
    call.mockResolvedValue(saleReceipt() as never);

    const result = await fetchReceipt(46);

    expect(call).toHaveBeenCalledWith("get_sale_receipt", { saleId: 46 });
    expect(result.receiptNo).toBe(3);
  });
});

/**
 * Column widths, measured rather than eyeballed.
 *
 * This is the regression that got through: the grand total was drawn into a
 * 36pt box, "1000.00" needs about 42pt at 10pt bold, and it wrapped onto a
 * second line reading "1000.0" / "0" on the printed receipt. Nothing in the
 * unit suite could see it, because the only evidence was inside a compressed
 * PDF stream.
 *
 * PDFKit will measure a string for us, so the check is direct: every column
 * must be at least as wide as the widest thing that column can ever hold.
 */
describe("the receipt fits on till paper", () => {
  /** PDFKit's own text measurement, for a given font and size. */
  function widthOf(text: string, font: string, size: number): number {
    const doc = new PDFDocument();
    const width = doc.font(font).fontSize(size).widthOfString(text);
    doc.end();
    return width;
  }

  // The worst case each column can realistically be asked to hold. The units
  // are the longest in the catalogue ("packet", "bottle"); the money figures
  // are five digits, which is far beyond anything this shop charges.
  it.each([
    ["quantity", "100.5 packet", COLUMNS.quantity.width],
    ["price", "99999.00", COLUMNS.price.width],
    ["line total", "99999.00", COLUMNS.total.width],
    // Longer names ellipsis by design; a typical catalogue name must not.
    ["product", "Cooking Oil Large", COLUMNS.product.width],
  ])("the %s column holds %p", (_label, widest, available) => {
    expect(widthOf(widest, "Helvetica", BODY_SIZE)).toBeLessThanOrEqual(
      available,
    );
  });

  it("the grand total column holds a six-figure total without wrapping", () => {
    expect(
      widthOf("999999.00", "Helvetica-Bold", TOTAL_SIZE),
    ).toBeLessThanOrEqual(TOTAL_ROW.amount.width);
  });

  it("the grand total label fits beside it", () => {
    expect(
      widthOf("GRAND TOTAL", "Helvetica-Bold", TOTAL_SIZE),
    ).toBeLessThanOrEqual(TOTAL_ROW.label.width);
  });

  it("the columns tile the page without overlapping or overflowing", () => {
    // Each column starts where the previous one ends, and the last ends at the
    // content edge. Overlap here is what makes two numbers run together.
    const ordered = [
      COLUMNS.product,
      COLUMNS.quantity,
      COLUMNS.price,
      COLUMNS.total,
    ];

    ordered.forEach((column, index) => {
      const previous = ordered[index - 1];
      expect(column.x).toBe(previous ? previous.x + previous.width : 0);
    });

    const last = ordered[ordered.length - 1];
    expect(last.x + last.width).toBe(CONTENT);
    expect(TOTAL_ROW.amount.x + TOTAL_ROW.amount.width).toBe(CONTENT);
  });
});

describe("renderReceiptPdf", () => {
  it("produces a real PDF", async () => {
    const pdf = await renderReceiptPdf(buildReceiptModel(saleReceipt()));

    // The magic bytes, not just "some bytes came back".
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(500);
  });

  it("grows with the number of lines", async () => {
    const one = await renderReceiptPdf(
      buildReceiptModel(saleReceipt({ items: saleReceipt().items?.slice(0, 1) })),
    );
    const many = await renderReceiptPdf(
      buildReceiptModel(
        saleReceipt({
          items: Array.from({ length: 12 }, (_, index) => ({
            productId: index,
            productName: `Product ${index}`,
            unit: "kg",
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          })),
        }),
      ),
    );

    expect(many.length).toBeGreaterThan(one.length);
  });

  it("renders a sale with no items without throwing", async () => {
    const pdf = await renderReceiptPdf(
      buildReceiptModel(saleReceipt({ items: [], totalAmount: 0 })),
    );

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
