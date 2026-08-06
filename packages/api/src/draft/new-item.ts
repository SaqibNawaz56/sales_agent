import type { DraftItem } from "./draft.types";

/**
 * A draft item as it exists immediately after extraction: the owner's own words
 * and nothing else. Every catalogue field starts null and is filled only by
 * resolution, which is what keeps a model-supplied value out of a price (R3).
 */
export function newItem(
  rawProduct: string,
  quantity: number | null,
  rawUnit: string | null,
): DraftItem {
  return {
    rawProduct,
    rawUnit,
    quantity,
    productId: null,
    productName: null,
    unit: null,
    unitPrice: null,
    suggestions: [],
  };
}
