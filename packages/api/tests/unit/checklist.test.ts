import { checkItem, runChecklist } from "../../src/checklist";
import { draftWith, rawItem, resolvedItem, unknownItem } from "./helpers/fixtures";

/**
 * The completeness rules.
 *
 * This is the decision the architecture deliberately keeps away from the model,
 * so it is also the one that most needs pinning: if runChecklist is right, the
 * sale is right.
 */

describe("checkItem", () => {
  it("reports no gap for a fully resolved item", () => {
    const draft = draftWith({ items: [resolvedItem()] });
    const check = checkItem(draft, 0);

    expect(check).toEqual({
      index: 0,
      productKnown: true,
      quantityPresent: true,
      priceResolved: true,
      gap: null,
    });
  });

  it("reports missing_quantity when the owner never said an amount", () => {
    const draft = draftWith({ items: [resolvedItem({ quantity: null })] });

    expect(checkItem(draft, 0).gap).toBe("missing_quantity");
  });

  it("reports unknown_product when the catalogue found nothing", () => {
    const draft = draftWith({ items: [unknownItem()] });

    expect(checkItem(draft, 0).gap).toBe("unknown_product");
  });

  it("asks about the product before the quantity when both are missing", () => {
    // Asking "how much oil?" about something that may not be in the catalogue
    // wastes the owner's turn, because the answer can end up discarded.
    const draft = draftWith({
      items: [unknownItem({ quantity: null })],
    });

    expect(checkItem(draft, 0).gap).toBe("unknown_product");
  });

  it("treats a zero quantity as present, not missing", () => {
    // null means "not stated". Zero is a statement.
    const draft = draftWith({ items: [resolvedItem({ quantity: 0 })] });

    expect(checkItem(draft, 0).quantityPresent).toBe(true);
    expect(checkItem(draft, 0).gap).toBeNull();
  });
});

describe("runChecklist", () => {
  it("is complete when every item resolves and the customer is known", () => {
    const draft = draftWith({
      customerName: "Ali",
      customerId: 7,
      items: [resolvedItem()],
    });
    const result = runChecklist(draft);

    expect(result.complete).toBe(true);
    expect(result.firstGap).toBeNull();
    expect(result.customerGap).toBeNull();
  });

  it("reports the customer as missing when no name was extracted", () => {
    const draft = draftWith({ items: [resolvedItem()] });

    expect(runChecklist(draft).customerGap).toBe("missing");
  });

  it("reports a named but unresolved customer as unconfirmed_new", () => {
    const draft = draftWith({ customerName: "Ali", items: [resolvedItem()] });

    expect(runChecklist(draft).customerGap).toBe("unconfirmed_new");
  });

  describe("one gap per turn", () => {
    it("returns items before the customer", () => {
      const draft = draftWith({
        items: [resolvedItem({ quantity: null })],
      });

      // Both are outstanding; only the item is offered.
      expect(runChecklist(draft).customerGap).toBe("missing");
      expect(runChecklist(draft).firstGap).toEqual({
        kind: "missing_quantity",
        itemIndex: 0,
      });
    });

    it("returns items in the order the owner said them", () => {
      const draft = draftWith({
        customerId: 7,
        customerName: "Ali",
        items: [
          resolvedItem(),
          resolvedItem({ quantity: null }),
          unknownItem(),
        ],
      });

      expect(runChecklist(draft).firstGap).toEqual({
        kind: "missing_quantity",
        itemIndex: 1,
      });
    });

    it("falls through to the customer once every item passes", () => {
      const draft = draftWith({
        customerName: "Ali",
        items: [resolvedItem()],
      });

      expect(runChecklist(draft).firstGap).toEqual({
        kind: "customer",
        itemIndex: null,
      });
    });
  });

  it("is not complete for a draft with no items at all", () => {
    // An empty sale must never reach a total, even with a known customer.
    const draft = draftWith({ customerName: "Ali", customerId: 7, items: [] });
    const result = runChecklist(draft);

    expect(result.complete).toBe(false);
    expect(result.firstGap).toBeNull();
  });

  /**
   * Pins a real inconsistency rather than asserting it is correct.
   *
   * `complete` requires priceResolved; `firstGap` does not consider it. An item
   * carrying a productId but no unitPrice therefore reports complete: false
   * with firstGap: null — and advanceDraft branches on firstGap, so such a
   * draft would go to the confirmation gate rather than raise a question.
   *
   * It is unreachable today because resolveItem writes id, unit and price
   * together or not at all. It is written down here so that if resolution ever
   * changes, this test fails and says exactly what the consequence is.
   */
  it("has no gap to report for a priced-but-unresolved item (known limitation)", () => {
    const draft = draftWith({
      customerName: "Ali",
      customerId: 7,
      items: [resolvedItem({ unitPrice: null })],
    });
    const result = runChecklist(draft);

    expect(result.complete).toBe(false);
    expect(result.firstGap).toBeNull();
  });
});
