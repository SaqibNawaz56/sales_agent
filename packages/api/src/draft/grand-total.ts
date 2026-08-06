import type { DraftSale } from "./draft.types";
import { lineTotal } from "./line-total";

/** The grand total, or null while any item is incomplete. */
export function grandTotal(draft: DraftSale): number | null {
  if (draft.items.length === 0) return null;
  let sum = 0;
  for (const item of draft.items) {
    const total = lineTotal(item);
    if (total === null) return null;
    sum += total;
  }
  return Number(sum.toFixed(2));
}
