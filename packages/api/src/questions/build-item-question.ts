import type {
  AnswerChoice,
  DraftItem,
  MissingQuantityQuestion,
  UnknownProductQuestion,
} from "../draft";
import {
  CHOICE_NEW,
  CHOICE_NO,
  CHOICE_YES,
  suggestionChoiceId,
} from "./choice-ids";
import { formatList } from "./format-list";

/**
 * The quantity question uses the owner's own wording, not the catalogue's: he
 * said "oil", so the question says "oil" even though the catalogue calls it
 * "Cooking Oil".
 *
 * No buttons: an amount is not a choice from a list.
 */
export function buildQuantityQuestion(
  item: DraftItem,
  index: number,
): MissingQuantityQuestion {
  const unit = item.unit ? ` (in ${item.unit})` : "";
  return {
    kind: "missing_quantity",
    itemIndex: index,
    question: `How much ${item.rawProduct}${unit}?`,
    choices: [],
  };
}

/**
 * Offers near matches when the catalogue found any, and otherwise offers to add
 * the product — which is the only door into the new-product sub-loop (F5), and
 * therefore the only route by which a price enters the system.
 *
 * Both variants carry buttons, because agreeing here eventually writes a row to
 * `products`.
 */
export function buildUnknownProductQuestion(
  item: DraftItem,
  index: number,
): UnknownProductQuestion {
  const suggestions = item.suggestions;

  if (suggestions.length > 0) {
    const choices: AnswerChoice[] = suggestions.map((suggestion) => ({
      id: suggestionChoiceId(suggestion.id),
      label: suggestion.name,
      intent: "neutral",
    }));

    choices.push({
      id: CHOICE_NEW,
      label: `Add "${item.rawProduct}" instead`,
      intent: "affirm",
    });
    choices.push({ id: CHOICE_NO, label: "Leave it out", intent: "reject" });

    return {
      kind: "unknown_product",
      itemIndex: index,
      question: `I don't have "${item.rawProduct}" in your catalogue. Did you mean ${formatList(
        suggestions.map((s) => s.name),
      )}?`,
      choices,
    };
  }

  return {
    kind: "unknown_product",
    itemIndex: index,
    question: `"${item.rawProduct}" isn't in your catalogue. Do you want to add it?`,
    choices: [
      { id: CHOICE_YES, label: "Add to catalogue", intent: "affirm" },
      { id: CHOICE_NO, label: "Leave it out", intent: "reject" },
    ],
  };
}
