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
  const model = createModel().withStructuredOutput(quantityAnswerSchema, {
    name: "quantity_answer",
  });

  const result = await model.invoke([
    { role: "system", content: QUANTITY_ANSWER_PROMPT },
    { role: "user", content: `Question asked: "${question}"\nOwner replied: "${reply}"` },
  ]);

  return quantityAnswerSchema.parse(result);
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
  const model = createModel().withStructuredOutput(confirmationAnswerSchema, {
    name: "confirmation_answer",
  });

  const result = await model.invoke([
    { role: "system", content: CONFIRMATION_ANSWER_PROMPT },
    { role: "user", content: `Question asked: "${question}"\nOwner replied: "${reply}"` },
  ]);

  return confirmationAnswerSchema.parse(result);
}
