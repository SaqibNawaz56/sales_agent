import type { DraftSale } from "../draft";
import { applyCustomerAnswer } from "./apply-customer-answer";
import { applyNewProductPriceAnswer } from "./apply-new-product-price-answer";
import { applyQuantityAnswer } from "./apply-quantity-answer";
import { applyUnknownProductAnswer } from "./apply-unknown-product-answer";
import type { ApplyResult } from "./clarification.types";

/**
 * Applies a reply to the one thing that was asked about.
 *
 * Every handler below writes to a specific item index or to the customer field,
 * and nothing else. This is where F4 — "retains everything it already
 * understood, does not restart the sale" — is actually implemented.
 *
 * The dispatch is exhaustive over PendingQuestion's discriminant, so adding a
 * fifth kind of question is a compile error here until a handler exists for it.
 * That is deliberate: a silently unhandled question kind would strand a draft
 * mid-conversation with no way forward.
 */
export async function applyAnswer(
  draft: DraftSale,
  reply: string,
): Promise<ApplyResult> {
  const pending = draft.pending;
  if (!pending) {
    return { understood: false, note: "There was no outstanding question." };
  }

  switch (pending.kind) {
    case "missing_quantity":
      return applyQuantityAnswer(draft, pending, reply);
    case "unknown_product":
      return applyUnknownProductAnswer(draft, pending, reply);
    case "new_product_price":
      return applyNewProductPriceAnswer(draft, pending, reply);
    case "customer":
      return applyCustomerAnswer(draft, pending, reply);
  }
}
