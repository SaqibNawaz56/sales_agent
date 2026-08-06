import type { DraftItem } from "./draft.types";

/** A line total, or null while the item is still incomplete. */
export function lineTotal(item: DraftItem): number | null {
  if (item.quantity === null || item.unitPrice === null) return null;
  return Number((item.quantity * item.unitPrice).toFixed(2));
}
