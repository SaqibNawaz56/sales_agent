import { callServerTool } from "../mcp";
import type { PendingPriceChange, UpdatePriceResult } from "./pricing.types";

/**
 * Writes the new catalogue price. The ONLY call site of update_product_price.
 *
 * Reached only from a pressed confirmation button, never from anything the
 * model produced — the same shape as the sale write, because this is the same
 * kind of decision: a number the owner typed becoming money in the database.
 *
 * Note what it does not disturb. Past sales keep their snapshotted prices, so
 * changing the catalogue cannot rewrite what any earlier sale charged (F7).
 * The change applies from the next sale onward and no further back.
 */
export async function applyPriceChange(
  pending: PendingPriceChange,
): Promise<string> {
  try {
    const result = await callServerTool<UpdatePriceResult>(
      "update_product_price",
      { productId: pending.productId, price: pending.newPrice },
    );

    if (!result.updated || !result.product) {
      return `The price was not changed: ${result.reason ?? "unknown error"}.`;
    }

    const { name, unit, previousPrice, currentPrice } = result.product;
    return `${name} is now ${currentPrice} per ${unit}, was ${previousPrice}. Past sales are unchanged.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `The price was not changed: ${message}`;
  }
}
