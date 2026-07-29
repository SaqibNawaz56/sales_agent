import type { DraftSale } from "./draft.js";
import { callServerTool } from "./mcp.js";

/**
 * Fills a draft with catalogue facts.
 *
 * Every value written here comes from PostgreSQL via an MCP tool the model was
 * never told about. The model supplied only the words; identity, unit and price
 * are decided by the database. This is the mechanism behind R3 — a hallucinated
 * price has no route into the draft, because nothing the model produced is
 * copied into a price field.
 */

interface LookupResult {
  found: boolean;
  product?: { id: number; name: string; unit: string; currentPrice: number };
  suggestions?: Array<{ id: number; name: string }>;
}

interface CustomerResult {
  found: boolean;
  created: boolean;
  customer?: { id: number; name: string };
  suggestions?: Array<{ id: number; name: string }>;
}

export async function resolveDraft(draft: DraftSale): Promise<DraftSale> {
  for (const item of draft.items) {
    // Already resolved items are left alone, so re-running after a
    // clarification does not re-query the whole sale.
    if (item.productId !== null) continue;

    const result = await callServerTool<LookupResult>("lookup_product", {
      name: item.rawProduct,
    });

    if (result.found && result.product) {
      item.productId = result.product.id;
      item.productName = result.product.name;
      item.unit = result.product.unit;
      item.unitPrice = result.product.currentPrice;
      item.suggestions = [];
    } else {
      item.suggestions = result.suggestions ?? [];
    }
  }

  if (draft.customerName !== null && draft.customerId === null) {
    // createIfMissing is deliberately omitted: resolution must never create a
    // customer as a side effect. Creating one is an explicit, confirmed action
    // taken later by the controller (R2).
    const result = await callServerTool<CustomerResult>(
      "find_or_create_customer",
      { name: draft.customerName },
    );

    if (result.found && result.customer) {
      draft.customerId = result.customer.id;
      draft.customerSuggestions = [];
    } else {
      draft.customerSuggestions = result.suggestions ?? [];
    }
  }

  return draft;
}
