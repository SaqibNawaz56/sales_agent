import type { GapLocation } from "./checklist.js";
import type { DraftItem, DraftSale, PendingQuestion } from "./draft.js";

/**
 * Turns a checklist gap into the question to ask.
 *
 * Templates, not a model call. The question is a consequence of a known gap, so
 * generating it is deterministic work — asking the LLM to phrase it would add
 * latency and token cost, spend budget against Groq's per-minute limit, and
 * introduce variability into the one part of the conversation that should be
 * predictable. It also keeps F4 honest: the question is built from the specific
 * item index the checklist identified, so it cannot drift onto another item.
 */

function list(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * Opens the new-product sub-loop.
 *
 * Asks for the unit alongside the price when the owner never said one — "1
 * ghee to Ali" gives no unit, and create_product needs one. Combining them
 * costs one turn instead of two, and the answers cannot be confused for each
 * other.
 */
export function buildPriceQuestion(
  item: DraftItem,
  index: number,
): PendingQuestion {
  const question =
    item.rawUnit !== null
      ? `What's the price of ${item.rawProduct} per ${item.rawUnit}?`
      : `What's the price of ${item.rawProduct}, and per what unit (kg, litre, packet)?`;

  return { kind: "new_product_price", itemIndex: index, question };
}

export function buildQuestion(
  draft: DraftSale,
  gap: GapLocation,
): PendingQuestion {
  if (gap.kind === "customer") {
    if (draft.customerName === null) {
      return {
        kind: "customer",
        itemIndex: null,
        question: "Who was this sale for?",
      };
    }

    const suggestions = draft.customerSuggestions.map((s) => s.name);
    if (suggestions.length > 0) {
      return {
        kind: "customer",
        itemIndex: null,
        question: `I don't have "${draft.customerName}" on file. Did you mean ${list(
          suggestions,
        )}?`,
      };
    }

    return {
      kind: "customer",
      itemIndex: null,
      question: `"${draft.customerName}" is a new customer. Add them?`,
    };
  }

  const index = gap.itemIndex as number;
  const item = draft.items[index];

  if (gap.kind === "missing_quantity") {
    // The owner's own wording, not the catalogue's: he said "oil", so the
    // question says "oil" even though the catalogue calls it "Cooking Oil".
    const unit = item.unit ? ` (in ${item.unit})` : "";
    return {
      kind: "missing_quantity",
      itemIndex: index,
      question: `How much ${item.rawProduct}${unit}?`,
    };
  }

  const suggestions = item.suggestions.map((s) => s.name);
  if (suggestions.length > 0) {
    return {
      kind: "unknown_product",
      itemIndex: index,
      question: `I don't have "${item.rawProduct}" in your catalogue. Did you mean ${list(
        suggestions,
      )}?`,
    };
  }

  return {
    kind: "unknown_product",
    itemIndex: index,
    question: `"${item.rawProduct}" isn't in your catalogue. Do you want to add it?`,
  };
}
