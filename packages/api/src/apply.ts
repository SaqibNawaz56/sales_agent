import { parseConfirmationAnswer, parseQuantityAnswer } from "./answers.js";
import type { DraftSale } from "./draft.js";
import { callServerTool } from "./mcp.js";

/**
 * Applies a reply to the one thing that was asked about.
 *
 * Every branch here writes to a specific item index or to the customer field,
 * and nothing else. This is where F4 — "retains everything it already
 * understood, does not restart the sale" — is actually implemented.
 */

export interface ApplyResult {
  /** False when the reply did not answer the question that was asked. */
  understood: boolean;
  /** Shown to the owner when his reply could not be used. */
  note?: string;
}

const UNITS = "kg|kgs|g|gram|grams|litre|litres|liter|liters|l|ml|dozen|packet|packets|piece|pieces|bottle|bottles";

/**
 * Guards against an amount being mistaken for a name.
 *
 * The confirmation parser returns any non-yes/no reply in `value`, so a reply
 * of "2 litres" to "did you mean Cooking Oil?" would otherwise be adopted as a
 * product name and put an item called "2 litres" into the sale. A name that is
 * nothing but digits and a unit is not a name.
 */
function looksLikeQuantity(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return true;
  return new RegExp(`^[\\d.,\\s]+(${UNITS})?s?$`, "i").test(trimmed);
}

interface CustomerResult {
  found: boolean;
  created: boolean;
  customer?: { id: number; name: string };
}

export async function applyAnswer(
  draft: DraftSale,
  reply: string,
): Promise<ApplyResult> {
  const pending = draft.pending;
  if (!pending) {
    return { understood: false, note: "There was no outstanding question." };
  }

  if (pending.kind === "missing_quantity") {
    const answer = await parseQuantityAnswer(pending.question, reply);

    if (answer.quantity === null) {
      // Leave the question standing rather than guessing. An invented quantity
      // is the R1 failure mode and would be invisible on the summary.
      return {
        understood: false,
        note: "I didn't catch an amount there.",
      };
    }

    const item = draft.items[pending.itemIndex];
    item.quantity = answer.quantity;
    if (answer.unit !== null && item.rawUnit === null) {
      item.rawUnit = answer.unit;
    }

    draft.pending = null;
    return { understood: true };
  }

  if (pending.kind === "unknown_product") {
    const item = draft.items[pending.itemIndex];
    const answer = await parseConfirmationAnswer(pending.question, reply);

    // "Did you mean sugar?" -> yes. Adopt the suggestion and let resolution
    // fill in the identity and price on the next pass.
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
      // "Add it?" -> yes. Creating it needs a price, which is the Day 4
      // sub-loop. Until then the gap stands.
      return {
        understood: false,
        note: "Adding a new product needs its price — that comes next.",
      };
    }

    if (answer.decision === "no") {
      // Dropping the item is cleaner than leaving a sale that can never
      // complete, and the owner can always restate it.
      draft.items.splice(pending.itemIndex, 1);
      draft.pending = null;
      return { understood: true, note: "Left that item out." };
    }

    return { understood: false, note: "Sorry, was that a yes or a no?" };
  }

  // pending.kind === "customer"
  const answer = await parseConfirmationAnswer(pending.question, reply);

  // "Did you mean Ali?" -> yes. The suggestion already carries a real id, so no
  // lookup and no creation is needed.
  if (answer.decision === "yes" && draft.customerSuggestions.length > 0) {
    const chosen = draft.customerSuggestions[0];
    draft.customerId = chosen.id;
    draft.customerName = chosen.name;
    draft.customerSuggestions = [];
    draft.pending = null;
    return { understood: true };
  }

  // "Ali is a new customer. Add them?" -> yes. This is the explicit, confirmed
  // action R2 requires before a customer row may be created.
  if (answer.decision === "yes" && draft.customerName !== null) {
    const created = await callServerTool<CustomerResult>(
      "find_or_create_customer",
      { name: draft.customerName, createIfMissing: true },
    );
    if (created.customer) {
      draft.customerId = created.customer.id;
      draft.customerName = created.customer.name;
      draft.pending = null;
      return { understood: true };
    }
    return { understood: false, note: "I couldn't add that customer." };
  }

  // He supplied a name — either answering "who was this for?" or correcting a
  // wrong guess. Resolution will look it up on the next pass.
  if (answer.value !== null && !looksLikeQuantity(answer.value)) {
    draft.customerName = answer.value;
    draft.customerId = null;
    draft.customerSuggestions = [];
    draft.pending = null;
    return { understood: true };
  }

  return { understood: false, note: "Who was this sale for?" };
}
