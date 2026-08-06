import type { DraftSale } from "../draft";
import { callServerTool } from "../mcp";
import type { FindCustomerResult } from "./catalogue.types";

/**
 * Looks the customer up, without ever creating one.
 *
 * createIfMissing is deliberately omitted: resolution must never create a
 * customer as a side effect. Creating one is an explicit, confirmed action
 * taken later from the clarification path (R2) — which is why that call lives
 * in clarification/apply-customer-answer.ts and not here.
 */
export async function resolveCustomer(draft: DraftSale): Promise<void> {
  if (draft.customerName === null || draft.customerId !== null) return;

  const result = await callServerTool<FindCustomerResult>(
    "find_or_create_customer",
    { name: draft.customerName },
  );

  if (result.found && result.customer) {
    draft.customerId = result.customer.id;
    draft.customerSuggestions = [];
    return;
  }

  draft.customerSuggestions = result.suggestions ?? [];
}
