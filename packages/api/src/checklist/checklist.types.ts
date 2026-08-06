import type { CustomerGap, ItemGap } from "../draft";

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
