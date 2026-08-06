import type { DraftSale, UnknownProductQuestion } from "../draft";
import { parseConfirmationAnswer } from "../llm";
import { buildPriceQuestion } from "../questions";
import type { ApplyResult } from "./clarification.types";
import { looksLikeQuantity } from "./looks-like-quantity";

/**
 * Resolves "I don't have that product — did you mean X / shall I add it?".
 *
 * The branch order matters and is not arbitrary: adopting a suggestion and
 * adopting a typed-in name both settle the item outright, so they are tried
 * before the "add it" path, which is the only one that opens the new-product
 * sub-loop and starts asking about money.
 */
export async function applyUnknownProductAnswer(
  draft: DraftSale,
  pending: UnknownProductQuestion,
  reply: string,
): Promise<ApplyResult> {
  const item = draft.items[pending.itemIndex];
  const answer = await parseConfirmationAnswer(pending.question, reply);

  // "Did you mean sugar?" -> yes. Adopt the suggestion and let resolution fill
  // in the identity and price on the next pass.
  if (answer.decision === "yes" && item.suggestions.length > 0) {
    item.rawProduct = item.suggestions[0].name;
    item.suggestions = [];
    draft.pending = null;
    return { understood: true };
  }

  // He typed a different product name instead of answering.
  if (answer.value !== null && !looksLikeQuantity(answer.value)) {
    item.rawProduct = answer.value;
    item.suggestions = [];
    draft.pending = null;
    return { understood: true };
  }

  if (answer.decision === "yes") {
    // "Add it?" -> yes. Pause this item and ask for the price (F5). The rest of
    // the sale is untouched and resumes once the product exists.
    draft.pending = buildPriceQuestion(item, pending.itemIndex);
    return { understood: true };
  }

  if (answer.decision === "no") {
    // Dropping the item is cleaner than leaving a sale that can never complete,
    // and the owner can always restate it.
    draft.items.splice(pending.itemIndex, 1);
    draft.pending = null;
    return { understood: true, note: "Left that item out." };
  }

  return { understood: false, note: "Sorry, was that a yes or a no?" };
}
