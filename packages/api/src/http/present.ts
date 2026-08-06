import { grandTotal, lineTotal, type DraftSale } from "../draft";

/**
 * The shape the client renders. Derived from the draft rather than exposing it
 * directly, so the internal state can change without breaking the UI, and so
 * nothing incidental leaks into a response.
 */
export function presentDraft(draft: DraftSale | null) {
  if (!draft) return null;
  return {
    customer: draft.customerName,
    status: draft.status,
    items: draft.items.map((item) => ({
      product: item.productName ?? item.rawProduct,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      lineTotal: lineTotal(item),
    })),
    grandTotal: grandTotal(draft),
  };
}

/**
 * The outstanding question and the buttons that answer it.
 *
 * Only `id` and `label` cross the wire — the client renders the label and
 * echoes the id back. It is never told what a choice will do, because it is
 * never the thing that decides: applyChoice resolves the id against the
 * question the server itself last issued.
 *
 * `choices` is empty for questions that want typing (an amount, a price), which
 * is how the client knows to show the composer instead of buttons.
 */
export function presentQuestion(draft: DraftSale | null) {
  const pending = draft?.pending;
  if (!pending) return null;

  return {
    text: pending.question,
    choices: pending.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      intent: choice.intent,
    })),
  };
}
