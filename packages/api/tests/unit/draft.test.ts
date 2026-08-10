import { emptyDraft, grandTotal, lineTotal, newItem } from "../../src/draft";
import { draftWith, rawItem, resolvedItem } from "./helpers/fixtures";

describe("emptyDraft", () => {
  it("starts building, with no customer and no items", () => {
    const draft = emptyDraft("2kg rice to Ali");

    expect(draft.status).toBe("building");
    expect(draft.originalMessage).toBe("2kg rice to Ali");
    expect(draft.customerName).toBeNull();
    expect(draft.customerId).toBeNull();
    expect(draft.items).toEqual([]);
    expect(draft.pending).toBeNull();
  });
});

describe("newItem", () => {
  it("keeps the owner's words and leaves every catalogue field null", () => {
    const item = newItem("oil", 2, "litre");

    expect(item.rawProduct).toBe("oil");
    expect(item.rawUnit).toBe("litre");
    expect(item.quantity).toBe(2);

    // R3: nothing the model produced may reach a price. An item cannot be
    // constructed carrying one, so there is no path for a hallucinated figure
    // to arrive before the catalogue has spoken.
    expect(item.productId).toBeNull();
    expect(item.productName).toBeNull();
    expect(item.unit).toBeNull();
    expect(item.unitPrice).toBeNull();
  });

  it("accepts a null quantity, which is what the checklist later asks about", () => {
    expect(newItem("oil", null, null).quantity).toBeNull();
  });
});

describe("lineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotal(resolvedItem({ quantity: 2, unitPrice: 300 }))).toBe(600);
  });

  it("is null while the quantity is unknown", () => {
    expect(lineTotal(resolvedItem({ quantity: null }))).toBeNull();
  });

  it("is null while the price is unknown", () => {
    expect(lineTotal(resolvedItem({ unitPrice: null }))).toBeNull();
  });

  it("rounds to two decimals rather than exposing float drift", () => {
    // 3 * 0.1 is 0.30000000000000004 in binary floating point.
    expect(lineTotal(resolvedItem({ quantity: 3, unitPrice: 0.1 }))).toBe(0.3);
  });

  it("handles a fractional quantity", () => {
    expect(lineTotal(resolvedItem({ quantity: 1.5, unitPrice: 250 }))).toBe(375);
  });

  it("is zero, not null, for a genuinely free item", () => {
    // Distinguishing "no price yet" from "costs nothing" matters: only the
    // first is a gap the checklist should hold the sale open for.
    expect(lineTotal(resolvedItem({ unitPrice: 0 }))).toBe(0);
  });
});

describe("grandTotal", () => {
  it("sums the line totals", () => {
    const draft = draftWith({
      items: [
        resolvedItem({ quantity: 2, unitPrice: 300 }),
        resolvedItem({ quantity: 2, unitPrice: 100 }),
      ],
    });

    expect(grandTotal(draft)).toBe(800);
  });

  it("is null when any single item is incomplete", () => {
    // Not "sum what we can". A partial total shown on the summary would be a
    // figure the owner could approve without noticing what it left out.
    const draft = draftWith({
      items: [resolvedItem(), rawItem("oil", null, null)],
    });

    expect(grandTotal(draft)).toBeNull();
  });

  it("is null for an empty draft", () => {
    expect(grandTotal(draftWith({ items: [] }))).toBeNull();
  });

  it("rounds the sum rather than accumulating drift across many lines", () => {
    const draft = draftWith({
      items: Array.from({ length: 10 }, () =>
        resolvedItem({ quantity: 1, unitPrice: 0.1 }),
      ),
    });

    expect(grandTotal(draft)).toBe(1);
  });
});
