import type { DraftSale, ItemGap } from "../draft";
import type { ItemCheck } from "./checklist.types";

/**
 * The per-item half of the completeness checklist (F3).
 *
 * Pure and synchronous by design. This is the decision your proposal insists
 * must live in application code rather than in the agent loop, so it takes a
 * draft and returns facts — no model, no database, no I/O of any kind.
 */
export function checkItem(draft: DraftSale, index: number): ItemCheck {
  const item = draft.items[index];

  const productKnown = item.productId !== null;
  const quantityPresent = item.quantity !== null;
  // Price is never supplied by the model — it is present only if the catalogue
  // returned one, which in turn requires the product to be known (R3).
  const priceResolved = item.unitPrice !== null;

  // Product first: asking "how much oil?" about a product that is not in the
  // catalogue wastes the owner's turn, since the answer may be discarded.
  let gap: ItemGap | null = null;
  if (!productKnown) {
    gap = "unknown_product";
  } else if (!quantityPresent) {
    gap = "missing_quantity";
  }

  return { index, productKnown, quantityPresent, priceResolved, gap };
}
