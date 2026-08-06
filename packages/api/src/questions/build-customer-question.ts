import type { AnswerChoice, CustomerQuestion, DraftSale } from "../draft";
import {
  CHOICE_NEW,
  CHOICE_NO,
  CHOICE_YES,
  suggestionChoiceId,
} from "./choice-ids";
import { formatList } from "./format-list";

/**
 * The three customer questions, in order of what is actually known: no name at
 * all, a name the catalogue offered near matches for, or a name that is simply
 * new. Each states the situation rather than asking a generic question, so the
 * owner's reply can be parsed narrowly.
 *
 * The last two also carry buttons. Answering them by typing still works — the
 * model parses the reply as before — but the buttons make the answer to a
 * question that ends in a database write a press rather than an interpretation.
 */
export function buildCustomerQuestion(draft: DraftSale): CustomerQuestion {
  if (draft.customerName === null) {
    // Nothing to offer: there is no name to accept or reject yet.
    return {
      kind: "customer",
      itemIndex: null,
      question: "Who was this sale for?",
      choices: [],
    };
  }

  const suggestions = draft.customerSuggestions;
  if (suggestions.length > 0) {
    // One button per near match, because "yes" cannot say which one was meant.
    // Before this existed the handler simply took the first suggestion, so
    // agreeing to "did you mean saqib or Ali?" silently chose saqib.
    const choices: AnswerChoice[] = suggestions.map((suggestion) => ({
      id: suggestionChoiceId(suggestion.id),
      label: suggestion.name,
      intent: "neutral",
    }));

    choices.push({
      id: CHOICE_NEW,
      label: `Add "${draft.customerName}" as new`,
      intent: "affirm",
    });

    return {
      kind: "customer",
      itemIndex: null,
      question: `I don't have "${draft.customerName}" on file. Did you mean ${formatList(
        suggestions.map((s) => s.name),
      )}?`,
      choices,
    };
  }

  return {
    kind: "customer",
    itemIndex: null,
    question: `"${draft.customerName}" is a new customer. Add them?`,
    choices: [
      { id: CHOICE_YES, label: "Add customer", intent: "affirm" },
      { id: CHOICE_NO, label: "No, different name", intent: "reject" },
    ],
  };
}
