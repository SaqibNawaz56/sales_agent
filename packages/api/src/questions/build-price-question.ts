import type { DraftItem, NewProductPriceQuestion } from "../draft";

/**
 * Opens the new-product sub-loop.
 *
 * Asks for the unit alongside the price when the owner never said one — "1
 * ghee to Ali" gives no unit, and create_product needs one. Combining them
 * costs one turn instead of two, and the answers cannot be confused for each
 * other.
 */
export function buildPriceQuestion(
  item: DraftItem,
  index: number,
): NewProductPriceQuestion {
  const question =
    item.rawUnit !== null
      ? `What's the price of ${item.rawProduct} per ${item.rawUnit}?`
      : `What's the price of ${item.rawProduct}, and per what unit (kg, litre, packet)?`;

  // No buttons: a price is a number the owner states, never one of a set of
  // options this system could offer him. Offering a price would be inventing
  // one, which is precisely what R3 forbids.
  return { kind: "new_product_price", itemIndex: index, question, choices: [] };
}
