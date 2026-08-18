import type { LookupProductResult } from "../catalogue";
import { parsePriceAnswer } from "../llm";
import { callServerTool } from "../mcp";
import { CHOICE_NO, CHOICE_YES, formatList } from "../questions";
import type { PendingPriceChange } from "./pricing.types";

export interface PriceProposal {
  /** Set when the owner should be shown a confirmation. */
  pending: PendingPriceChange | null;
  /** What to say when there is nothing to confirm. */
  reply: string;
}

/**
 * Turns "change rice to 350" into a confirmation, or into a question.
 *
 * The price is read from the owner's original sentence by parsePriceAnswer —
 * the same narrow schema the new-product sub-loop uses, and the only shape in
 * the system permitted to carry money out of a model. The sale-extraction
 * schema names the product and nothing else, so there is still no path by
 * which an invented figure becomes a catalogue price (R3).
 *
 * Nothing is written here. This function only proposes.
 */
export async function proposePriceChange(
  productName: string | null,
  message: string,
): Promise<PriceProposal> {
  if (!productName) {
    return {
      pending: null,
      reply: "Which product's price do you want to change?",
    };
  }

  const found = await callServerTool<LookupProductResult>("lookup_product", {
    name: productName,
  });

  if (!found.found || !found.product) {
    const suggestions = found.suggestions ?? [];
    const didYouMean = suggestions.length
      ? ` Did you mean ${formatList(suggestions.map((s) => s.name))}?`
      : "";
    return {
      pending: null,
      reply: `"${productName}" isn't in your catalogue.${didYouMean}`,
    };
  }

  const product = found.product;
  const answer = await parsePriceAnswer(
    `What is the new price of ${product.name}?`,
    message,
  );

  if (answer.price === null) {
    // Never inferred, exactly as in the new-product sub-loop: this figure
    // becomes the price of every future sale of this product.
    return {
      pending: null,
      reply: `What's the new price of ${product.name} per ${product.unit}?`,
    };
  }

  if (answer.price === product.currentPrice) {
    return {
      pending: null,
      reply: `${product.name} is already ${product.currentPrice} per ${product.unit}.`,
    };
  }

  const direction = answer.price > product.currentPrice ? "up" : "down";

  return {
    reply: "",
    pending: {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      currentPrice: product.currentPrice,
      newPrice: answer.price,
      // Both figures are stated. The owner is approving a movement, and "change
      // rice to 350" is impossible to check without being told it was 300.
      question:
        `${product.name} is ${product.currentPrice} per ${product.unit}. ` +
        `Change it ${direction} to ${answer.price}?`,
      choices: [
        { id: CHOICE_YES, label: `Yes, ${answer.price}`, intent: "affirm" },
        { id: CHOICE_NO, label: "No, leave it", intent: "reject" },
      ],
    },
  };
}
