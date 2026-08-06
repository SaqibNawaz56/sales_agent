const UNITS =
  "kg|kgs|g|gram|grams|litre|litres|liter|liters|l|ml|dozen|packet|packets|piece|pieces|bottle|bottles";

/**
 * Guards against an amount being mistaken for a name.
 *
 * The confirmation parser returns any non-yes/no reply in `value`, so a reply
 * of "2 litres" to "did you mean Cooking Oil?" would otherwise be adopted as a
 * product name and put an item called "2 litres" into the sale. A name that is
 * nothing but digits and a unit is not a name.
 */
export function looksLikeQuantity(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return true;
  return new RegExp(`^[\\d.,\\s]+(${UNITS})?s?$`, "i").test(trimmed);
}
