import type { DraftSale, NewProductPriceQuestion } from "../draft";
import { parsePriceAnswer } from "../llm";
import { callServerTool } from "../mcp";
import type { CreateProductResult } from "../catalogue";
import type { ApplyResult } from "./clarification.types";

/**
 * The new-product sub-loop (F5) — the only route by which a price enters the
 * system.
 *
 * Worth reading closely, because it is the one place in the write path where a
 * number the owner typed becomes money in the database. Two guards matter: a
 * missing price is never inferred, and once the product is created the item is
 * refilled from what the catalogue now holds rather than from what was typed,
 * so it rejoins the same path as every other product.
 */
export async function applyNewProductPriceAnswer(
  draft: DraftSale,
  pending: NewProductPriceQuestion,
  reply: string,
): Promise<ApplyResult> {
  const item = draft.items[pending.itemIndex];
  const answer = await parsePriceAnswer(pending.question, reply);

  const price = answer.price ?? pending.priceSoFar ?? null;
  const unit = answer.unit ?? item.rawUnit ?? null;

  if (price === null) {
    // A price is never inferred. This is the single entry point for pricing
    // data, so a guess here would poison every future sale of this product.
    return { understood: false, note: "I didn't catch a price there." };
  }

  if (unit === null) {
    // Keep the price and ask only for what is still missing, rather than making
    // him restate both.
    draft.pending = {
      kind: "new_product_price",
      itemIndex: pending.itemIndex,
      question: `Got ${price}. And ${item.rawProduct} is sold per what unit — kg, litre, packet?`,
      choices: [],
      priceSoFar: price,
    };
    return { understood: true };
  }

  const created = await callServerTool<CreateProductResult>("create_product", {
    name: item.rawProduct,
    unit,
    price,
  });

  if (!created.product) {
    return { understood: false, note: "I couldn't add that product." };
  }

  // Resume: the item is filled from what the catalogue now holds, not from what
  // the owner typed, so it goes through the same path as every other product
  // from here on.
  item.productId = created.product.id;
  item.productName = created.product.name;
  item.unit = created.product.unit;
  item.unitPrice = created.product.currentPrice;
  item.suggestions = [];
  draft.pending = null;

  return {
    understood: true,
    note: `Added ${created.product.name} at ${created.product.currentPrice} per ${created.product.unit}.`,
  };
}
