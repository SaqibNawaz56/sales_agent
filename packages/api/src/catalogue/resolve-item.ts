import type { DraftItem } from "../draft";
import { callServerTool } from "../mcp";
import type { LookupProductResult } from "./catalogue.types";

/**
 * Fills one item with catalogue facts.
 *
 * Every value written here comes from PostgreSQL via an MCP tool the model was
 * never told about. The model supplied only the words; identity, unit and price
 * are decided by the database. This is the mechanism behind R3 — a hallucinated
 * price has no route into the draft, because nothing the model produced is
 * copied into a price field.
 */
export async function resolveItem(item: DraftItem): Promise<void> {
  // Already resolved items are left alone, so re-running after a clarification
  // does not re-query the whole sale.
  if (item.productId !== null) return;

  const result = await callServerTool<LookupProductResult>("lookup_product", {
    name: item.rawProduct,
  });

  if (result.found && result.product) {
    item.productId = result.product.id;
    item.productName = result.product.name;
    item.unit = result.product.unit;
    item.unitPrice = result.product.currentPrice;
    item.suggestions = [];
    return;
  }

  item.suggestions = result.suggestions ?? [];
}
