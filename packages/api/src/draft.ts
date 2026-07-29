/**
 * The draft sale — the application's own business state.
 *
 * Deliberately separate from LangChain's message history. The transcript is a
 * record of what was said; this is the sale being assembled, and it is the only
 * thing the write path ever reads. Keeping it out of framework memory means no
 * model output can mutate it except through the controller (see §2, "Memory
 * type", and the architecture boundary).
 */

/** Why an item cannot yet go on a sale. Empty means it is complete. */
export type ItemGap = "unknown_product" | "missing_quantity";

/** Why a draft cannot yet be confirmed, beyond the per-item gaps. */
export type CustomerGap = "missing" | "unconfirmed_new";

export interface Suggestion {
  id: number;
  name: string;
}

export interface DraftItem {
  /** What the owner actually said, kept verbatim for asking about it later. */
  rawProduct: string;
  rawUnit: string | null;

  quantity: number | null;

  /** Filled by resolution against the catalogue. Never supplied by the model. */
  productId: number | null;
  productName: string | null;
  unit: string | null;
  unitPrice: number | null;

  /** Near matches when the product is not in the catalogue (R2). */
  suggestions: Suggestion[];
}

export interface DraftSale {
  createdAt: string;
  /** The message that started this draft, for context in questions. */
  originalMessage: string;

  customerName: string | null;
  customerId: number | null;
  customerSuggestions: Suggestion[];

  items: DraftItem[];

  /** Set when the controller is waiting for an answer to a specific question. */
  pending: PendingQuestion | null;
}

export type PendingQuestion =
  | { kind: "missing_quantity"; itemIndex: number; question: string }
  | { kind: "unknown_product"; itemIndex: number; question: string }
  | { kind: "customer"; itemIndex: null; question: string };

export function emptyDraft(originalMessage: string): DraftSale {
  return {
    createdAt: new Date().toISOString(),
    originalMessage,
    customerName: null,
    customerId: null,
    customerSuggestions: [],
    items: [],
    pending: null,
  };
}

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

/** A line total, or null while the item is still incomplete. */
export function lineTotal(item: DraftItem): number | null {
  if (item.quantity === null || item.unitPrice === null) return null;
  return Number((item.quantity * item.unitPrice).toFixed(2));
}

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
