import type { DraftSale } from "./draft.types";

export function emptyDraft(originalMessage: string): DraftSale {
  return {
    createdAt: new Date().toISOString(),
    status: "building",
    originalMessage,
    customerName: null,
    customerId: null,
    customerSuggestions: [],
    items: [],
    pending: null,
  };
}
