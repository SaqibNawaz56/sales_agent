import type { CustomerGap, DraftSale } from "../draft";
import { checkItem } from "./check-item";
import type { ChecklistResult, GapLocation } from "./checklist.types";

/**
 * The whole-draft completeness checklist (F3).
 *
 * Pure, like checkItem. If this function is right, the sale is right — it is
 * the single place that decides whether a draft may proceed to a total.
 */
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
    items.length > 0 &&
    items.every((check) => check.gap === null && check.priceResolved);

  return {
    items,
    customerGap,
    complete: everyItemComplete && customerGap === null,
    firstGap,
  };
}
