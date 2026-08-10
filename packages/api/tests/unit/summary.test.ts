import { formatSummary } from "../../src/summary";
import { completeDraft, draftWith, rawItem, resolvedItem } from "./helpers/fixtures";

/**
 * The itemised summary shown before anything is written (F8).
 *
 * This is R1's mitigation — the owner's one chance to catch a misparse before
 * it becomes a business record — so what it must contain is a testable claim,
 * not a matter of taste.
 */

describe("formatSummary", () => {
  it("names the customer", () => {
    expect(formatSummary(completeDraft())).toContain("Sale to Ali");
  });

  it("says so plainly when the customer is still unknown", () => {
    const draft = draftWith({
      customerName: null,
      items: [resolvedItem()],
    });

    expect(formatSummary(draft)).toContain("Sale to unknown customer");
  });

  it("shows quantity, unit, price and line total for each item", () => {
    const draft = completeDraft({
      items: [resolvedItem({ productName: "Rice", quantity: 2, unitPrice: 300 })],
    });
    const summary = formatSummary(draft);

    expect(summary).toContain("Rice");
    expect(summary).toContain("300");
    expect(summary).toContain("600");
  });

  it("shows a line for every item", () => {
    const draft = completeDraft({
      items: [
        resolvedItem({ productName: "Rice" }),
        resolvedItem({ productName: "Sugar" }),
        resolvedItem({ productName: "Flour" }),
      ],
    });
    const summary = formatSummary(draft);

    for (const name of ["Rice", "Sugar", "Flour"]) {
      expect(summary).toContain(name);
    }
  });

  it("totals the sale", () => {
    const draft = completeDraft({
      items: [
        resolvedItem({ quantity: 2, unitPrice: 300 }),
        resolvedItem({ quantity: 2, unitPrice: 100 }),
      ],
    });
    const summary = formatSummary(draft);

    expect(summary).toContain("TOTAL");
    expect(summary).toContain("800");
  });

  it("says 'incomplete' rather than showing a partial total", () => {
    // A number here would be a figure the owner could approve without noticing
    // what it left out.
    const draft = draftWith({
      customerName: "Ali",
      items: [resolvedItem(), rawItem("oil", null, null)],
    });

    expect(formatSummary(draft)).toContain("incomplete");
  });

  it("falls back to the owner's own word when the catalogue name is absent", () => {
    const draft = draftWith({
      customerName: "Ali",
      items: [rawItem("ghee", 1, "kg")],
    });

    expect(formatSummary(draft)).toContain("ghee");
  });
});
