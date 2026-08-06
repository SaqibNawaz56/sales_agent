import type { DraftSale } from "../draft";
import { resolveCustomer } from "./resolve-customer";
import { resolveItem } from "./resolve-item";

/**
 * Fills a draft with catalogue facts.
 *
 * Sequential rather than concurrent: the MCP server logs every tool call to
 * tool_call_logs, and a readable audit trail (F11) is worth more here than the
 * few hundred milliseconds parallel lookups would save on a sale of two or
 * three items.
 */
export async function resolveDraft(draft: DraftSale): Promise<DraftSale> {
  for (const item of draft.items) {
    await resolveItem(item);
  }

  await resolveCustomer(draft);

  return draft;
}
