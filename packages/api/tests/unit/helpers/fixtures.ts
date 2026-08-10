import {
  emptyDraft,
  newItem,
  type DraftItem,
  type DraftSale,
} from "../../../src/draft";

/**
 * Draft builders for the unit suite.
 *
 * Every test below states only the field it is about and inherits the rest, so
 * a test named "asks for the quantity" contains a quantity of null and nothing
 * else that could be mistaken for the reason it passes.
 */

/** An item straight out of extraction: the owner's words, no catalogue facts. */
export function rawItem(
  rawProduct = "rice",
  quantity: number | null = 2,
  rawUnit: string | null = "kg",
): DraftItem {
  return newItem(rawProduct, quantity, rawUnit);
}

/**
 * An item after successful resolution.
 *
 * productId, unit and unitPrice are set together on purpose — resolveItem
 * writes all three from one catalogue row or none of them, so an item carrying
 * an id but no price does not occur in the running system.
 */
export function resolvedItem(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    ...newItem("rice", 2, "kg"),
    productId: 1,
    productName: "Rice",
    unit: "kg",
    unitPrice: 300,
    ...overrides,
  };
}

/** An item the catalogue could not match, carrying near misses. */
export function unknownItem(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    ...newItem("rise", 2, "kg"),
    suggestions: [{ id: 1, name: "Rice" }],
    ...overrides,
  };
}

export function draftWith(overrides: Partial<DraftSale> = {}): DraftSale {
  return { ...emptyDraft("2kg rice to Ali"), ...overrides };
}

/** A draft with nothing outstanding: resolved items and a known customer. */
export function completeDraft(overrides: Partial<DraftSale> = {}): DraftSale {
  return draftWith({
    customerName: "Ali",
    customerId: 7,
    items: [resolvedItem()],
    ...overrides,
  });
}
