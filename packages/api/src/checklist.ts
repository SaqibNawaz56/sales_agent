import type { CustomerGap, DraftSale, ItemGap } from "./draft.js";

/**
 * The per-item completeness checklist (F3).
 *
 * Pure and synchronous by design. This is the decision your proposal insists
 * must live in application code rather than in the agent loop, so it takes a
 * draft and returns facts — no model, no database, no I/O of any kind. If this
 * function is right, the sale is right.
 */

export interface ItemCheck {
  index: number;
  /** The product was found in the catalogue. */
  productKnown: boolean;
  /** The owner stated an amount. */
  quantityPresent: boolean;
  /** A price came back from the catalogue for this product. */
  priceResolved: boolean;
  /** The single thing blocking this item, or null when it is complete. */
  gap: ItemGap | null;
}

export interface GapLocation {
  kind: ItemGap | "customer";
  itemIndex: number | null;
}

export interface ChecklistResult {
  items: ItemCheck[];
  customerGap: CustomerGap | null;
  /** True when every item passes and the customer is settled. */
  complete: boolean;
  /** The one gap to ask about next, or null when nothing is outstanding. */
  firstGap: GapLocation | null;
}

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

export function runChecklist(draft: DraftSale): ChecklistResult {
  const items = draft.items.map((_, index) => checkItem(draft, index));

  let customerGap: CustomerGap | null = null;
  if (draft.customerId === null) {
    customerGap = draft.customerName === null ? "missing" : "unconfirmed_new";
  }

  // One gap per turn, in a fixed order: items in the order the owner said
  // them, then the customer. A combined question invites a combined answer,
  // which is ambiguous to map back onto specific items.
  let firstGap: GapLocation | null = null;
  for (const check of items) {
    if (check.gap !== null) {
      firstGap = { kind: check.gap, itemIndex: check.index };
      break;
    }
  }
  if (firstGap === null && customerGap !== null) {
    firstGap = { kind: "customer", itemIndex: null };
  }

  const everyItemComplete =
    items.length > 0 && items.every((check) => check.gap === null && check.priceResolved);

  return {
    items,
    customerGap,
    complete: everyItemComplete && customerGap === null,
    firstGap,
  };
}
