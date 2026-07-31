import { z } from "zod";

import { createModel } from "./model.js";

/**
 * Parsers for a reply to a specific clarification question.
 *
 * These are deliberately narrow. Running "2 litres" through the sale-extraction
 * prompt would produce a fresh draft containing only oil and discard everything
 * already understood — exactly the restart F4 forbids. A parser whose schema
 * cannot express a product or a customer cannot restart a sale, so "does not
 * restart" is a property of the type rather than a hope about the prompt.
 *
 * See docs/agent-prompts.md for the iteration history.
 */

export const quantityAnswerSchema = z.object({
  quantity: z
    .number()
    .nullable()
    .describe("The amount stated, or null if the reply contains no amount"),
  unit: z.string().nullable().describe("The unit if stated, otherwise null"),
});

export type QuantityAnswer = z.infer<typeof quantityAnswerSchema>;

export const QUANTITY_ANSWER_PROMPT = `You read a shop owner's reply to one specific question and extract only the amount.

- quantity: the number he stated, as a number. Convert words to digits, so "two" becomes 2 and "half" becomes 0.5.
- unit: the unit he stated, such as kg, litre, dozen, packet, piece or bottle. null if he stated none.

Rules:
- Never convert between units. "1 dozen" is quantity 1 with unit "dozen", not 12.
- If the reply contains no amount at all, quantity is null.
- Extract nothing else. Products, customers and prices are not your concern.`;

export async function parseQuantityAnswer(
  question: string,
  reply: string,
): Promise<QuantityAnswer> {
  const model = createModel("answer:quantity").withStructuredOutput(quantityAnswerSchema, {
    name: "quantity_answer",
  });

  const result = await model.invoke([
    { role: "system", content: QUANTITY_ANSWER_PROMPT },
    { role: "user", content: `Question asked: "${question}"\nOwner replied: "${reply}"` },
  ]);

  return quantityAnswerSchema.parse(result);
}

export const priceAnswerSchema = z.object({
  price: z
    .number()
    .nullable()
    .describe("The price per unit, or null if the reply states no price"),
  unit: z
    .string()
    .nullable()
    .describe("The unit the price is per, if stated, otherwise null"),
});

export type PriceAnswer = z.infer<typeof priceAnswerSchema>;

/**
 * The new-product sub-loop is the ONLY route by which a price enters the
 * system (F5, R3). Everywhere else, prices come from the catalogue. This parser
 * therefore reads a price the owner stated himself — it must never infer,
 * estimate, or carry over a number from anywhere else.
 */
export const PRICE_ANSWER_PROMPT = `You read a shop owner's reply stating the price of a product he is adding to his catalogue.

- price: the amount of money per unit, as a number. Ignore currency words and symbols like rupees, Rs or PKR.
- unit: the unit the price is per, such as kg, litre, dozen, packet, piece or bottle. null if he did not say.

Rules:
- Never estimate or infer a price. If the reply states no amount of money, price is null.
- "1200 per kg" is price 1200 with unit "kg".
- "Rs 450" is price 450 with unit null.
- Extract nothing else.`;

export async function parsePriceAnswer(
  question: string,
  reply: string,
): Promise<PriceAnswer> {
  const model = createModel("answer:price").withStructuredOutput(priceAnswerSchema, {
    name: "price_answer",
  });

  const result = await model.invoke([
    { role: "system", content: PRICE_ANSWER_PROMPT },
    { role: "user", content: `Question asked: "${question}"\nOwner replied: "${reply}"` },
  ]);

  return priceAnswerSchema.parse(result);
}

export const confirmationAnswerSchema = z.object({
  decision: z
    .enum(["yes", "no", "other"])
    .describe("Whether the owner agreed, declined, or did neither"),
  value: z
    .string()
    .nullable()
    .describe("A name he supplied instead of yes or no, exactly as written"),
});

export type ConfirmationAnswer = z.infer<typeof confirmationAnswerSchema>;

export const CONFIRMATION_ANSWER_PROMPT = `You classify a shop owner's reply to a yes/no question.

- decision: "yes" if he agreed, "no" if he declined, "other" if his reply is neither.
- value: if instead of agreeing he supplied a different name, return that name exactly as he wrote it. Otherwise null.

Rules:
- Never invent a name. If he did not write one, value is null.
- Classify only. Do not extract quantities, products or prices.`;

export async function parseConfirmationAnswer(
  question: string,
  reply: string,
): Promise<ConfirmationAnswer> {
  const model = createModel("answer:confirm").withStructuredOutput(confirmationAnswerSchema, {
    name: "confirmation_answer",
  });

  const result = await model.invoke([
    { role: "system", content: CONFIRMATION_ANSWER_PROMPT },
    { role: "user", content: `Question asked: "${question}"\nOwner replied: "${reply}"` },
  ]);

  return confirmationAnswerSchema.parse(result);
}
