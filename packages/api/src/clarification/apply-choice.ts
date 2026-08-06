import type { FindCustomerResult } from "../catalogue";
import type { DraftSale, UnknownProductQuestion } from "../draft";
import { callServerTool } from "../mcp";
import {
  CHOICE_NEW,
  CHOICE_YES,
  buildPriceQuestion,
  parseSuggestionChoiceId,
} from "../questions";
import type { ApplyResult } from "./clarification.types";

/**
 * Applies a pressed button.
 *
 * The whole point of this file is what it does NOT contain: there is no model
 * call anywhere in it. applyAnswer has to ask the LLM what a typed reply meant;
 * here the owner already said exactly what he meant by pressing one of a fixed
 * set of options this server issued moments earlier. Interpreting that would be
 * adding uncertainty for no reason.
 *
 * That matters because two of these branches end in a database write —
 * find_or_create_customer with createIfMissing, and the sub-loop that reaches
 * create_product. R2 calls for those to be "an explicit, confirmed action", and
 * a button press is the only kind of confirmation that cannot be misread.
 */
export async function applyChoice(
  draft: DraftSale,
  choiceId: string,
): Promise<ApplyResult> {
  const pending = draft.pending;
  if (!pending) {
    return { understood: false, note: "There was no outstanding question." };
  }

  // Fails closed. The id must be one this server offered for the question that
  // is actually outstanding, so a stale button from a previous turn, or an id
  // a client invented, is refused rather than acted on.
  if (!pending.choices.some((choice) => choice.id === choiceId)) {
    return {
      understood: false,
      note: "That option isn't available any more.",
    };
  }

  if (pending.kind === "customer") {
    // The customer branch works from draft.customerName, not from the question,
    // so it needs no narrowed pending.
    return applyCustomerChoice(draft, choiceId);
  }

  if (pending.kind === "unknown_product") {
    return applyProductChoice(draft, pending, choiceId);
  }

  // missing_quantity and new_product_price issue no choices, so the guard above
  // has already rejected anything that reaches here. Restated for exhaustiveness.
  return { understood: false, note: pending.question };
}

async function applyCustomerChoice(
  draft: DraftSale,
  choiceId: string,
): Promise<ApplyResult> {
  const suggestionId = parseSuggestionChoiceId(choiceId);

  if (suggestionId !== null) {
    const chosen = draft.customerSuggestions.find((s) => s.id === suggestionId);
    if (!chosen) {
      return { understood: false, note: "I couldn't find that customer." };
    }
    // The suggestion already carries a real id, so no lookup and no creation.
    draft.customerId = chosen.id;
    draft.customerName = chosen.name;
    draft.customerSuggestions = [];
    draft.pending = null;
    return { understood: true };
  }

  if (choiceId === CHOICE_YES || choiceId === CHOICE_NEW) {
    if (draft.customerName === null) {
      return { understood: false, note: "Who was this sale for?" };
    }

    const created = await callServerTool<FindCustomerResult>(
      "find_or_create_customer",
      { name: draft.customerName, createIfMissing: true },
    );

    if (!created.customer) {
      return { understood: false, note: "I couldn't add that customer." };
    }

    draft.customerId = created.customer.id;
    draft.customerName = created.customer.name;
    draft.customerSuggestions = [];
    draft.pending = null;
    return { understood: true, note: `Added ${created.customer.name}.` };
  }

  // CHOICE_NO — none of these, and don't create. Clearing the name sends the
  // checklist back to "Who was this sale for?" on the next pass rather than
  // leaving a draft stuck on a name the owner has just rejected.
  draft.customerName = null;
  draft.customerId = null;
  draft.customerSuggestions = [];
  draft.pending = null;
  return { understood: true };
}

function applyProductChoice(
  draft: DraftSale,
  pending: UnknownProductQuestion,
  choiceId: string,
): ApplyResult {
  const item = draft.items[pending.itemIndex];
  const suggestionId = parseSuggestionChoiceId(choiceId);

  if (suggestionId !== null) {
    const chosen = item.suggestions.find((s) => s.id === suggestionId);
    if (!chosen) {
      return { understood: false, note: "I couldn't find that product." };
    }
    // Adopt the catalogue's name and let resolution fill in the identity and
    // price on the next pass, so this item goes through the same path as any
    // other product.
    item.rawProduct = chosen.name;
    item.suggestions = [];
    draft.pending = null;
    return { understood: true };
  }

  if (choiceId === CHOICE_YES || choiceId === CHOICE_NEW) {
    // Pause this item and ask for the price (F5). The rest of the sale is
    // untouched and resumes once the product exists.
    item.suggestions = [];
    draft.pending = buildPriceQuestion(item, pending.itemIndex);
    return { understood: true };
  }

  // CHOICE_NO — dropping the item is cleaner than leaving a sale that can never
  // complete, and the owner can always restate it.
  draft.items.splice(pending.itemIndex, 1);
  draft.pending = null;
  return { understood: true, note: "Left that item out." };
}
