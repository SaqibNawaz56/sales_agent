import type { CustomerQuestion, DraftSale } from "../draft";
import type { FindCustomerResult } from "../catalogue";
import { parseConfirmationAnswer } from "../llm";
import { callServerTool } from "../mcp";
import type { ApplyResult } from "./clarification.types";
import { looksLikeQuantity } from "./looks-like-quantity";

/**
 * Settles who the sale is for.
 *
 * This is the only place in the system that passes createIfMissing to
 * find_or_create_customer. Resolution deliberately never does (see
 * catalogue/resolve-customer.ts), so a customer row can only appear after the
 * owner said yes to a question naming them — which is what R2 asks for.
 */
export async function applyCustomerAnswer(
  draft: DraftSale,
  pending: CustomerQuestion,
  reply: string,
): Promise<ApplyResult> {
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
    const created = await callServerTool<FindCustomerResult>(
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
