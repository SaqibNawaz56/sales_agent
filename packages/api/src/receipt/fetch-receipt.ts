import { callServerTool } from "../mcp";
import type { SaleReceipt } from "./receipt.types";

/**
 * Reads one sale for its receipt.
 *
 * Through the controller's own MCP client, like every other catalogue read.
 * get_sale_receipt is not on AGENT_TOOL_ALLOWLIST — it carries a real customer
 * name and the prices that customer paid — so this is the only route to it.
 */
export function fetchReceipt(saleId: number): Promise<SaleReceipt> {
  return callServerTool<SaleReceipt>("get_sale_receipt", { saleId });
}
