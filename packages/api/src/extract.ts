import { z } from "zod";

import { createModel } from "./model.js";

/**
 * What the model is allowed to produce from a sale sentence.
 *
 * Note what is absent: there is no price field anywhere. The model is never
 * asked for one and has no place to put one, so a hallucinated price cannot
 * even be expressed, let alone persisted (risk R3). Prices are resolved by the
 * controller against the catalogue after extraction.
 */
export const extractedItemSchema = z.object({
  product: z
    .string()
    .describe("Product name only, without quantity or unit"),
  quantity: z
    .number()
    .nullable()
    .describe("Numeric quantity, or null if the owner did not state one"),
  unit: z
    .string()
    .nullable()
    .describe("Unit of measure if stated, otherwise null"),
});

export const extractedSaleSchema = z.object({
  intent: z
    .enum(["log_sale", "query", "other"])
    .describe("What the owner is trying to do"),
  customer: z
    .string()
    .nullable()
    .describe("Who the goods were sold to, or null if not stated"),
  items: z.array(extractedItemSchema),
});

export type ExtractedSale = z.infer<typeof extractedSaleSchema>;

/**
 * Extraction prompt v3. See docs/agent-prompts.md for the iteration history.
 *
 * Two rules here exist because of named risks rather than style preference:
 * the spelled-out-number rule addresses R1 ("two kg" misread as 20), and the
 * no-prices rule reinforces R3 at the prompt level even though the schema
 * already makes a price impossible to return.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You extract structured sale data from a shop owner's message. You do not answer questions, look anything up, or calculate totals.

Decide the intent first:
- "log_sale" when the owner is recording something he has just sold.
- "query" when he is asking about past sales.
- "other" for anything else.

Then extract:
- customer: the person the goods were sold to, written exactly as the owner wrote it. null if no person is named.
- items: one entry for each distinct product mentioned.

For each item:
- product: the product name only, with no quantity and no unit attached.
- quantity: the amount as a number. Convert spelled-out numbers to digits, so "two" becomes 2 and "half" becomes 0.5. Use null if the owner stated no amount.
- unit: the unit of measure if the owner stated one, such as kg, litre, dozen, packet, piece or bottle. Use null if he did not.

Rules you must follow:
- Never invent a quantity. If no amount was stated, quantity is null.
- Never output a price. Prices are not part of your task.
- A number written as a word keeps its value: "two kg" is quantity 2, never 20.
- "2kg rice" is a single item: product "rice", quantity 2, unit "kg".
- Never convert between units. The quantity is the count of the unit the owner named, exactly as he named it. "1 dozen eggs" is quantity 1 with unit "dozen" — it is not quantity 12. "2 packets tea" is quantity 2 with unit "packet".
- If the intent is not "log_sale", items must be an empty list.`;

/**
 * Turns one free-form sentence into structured data.
 *
 * No tools are bound here. Under the architecture boundary the model's entire
 * job in the capture flow is language understanding; every catalogue fact and
 * every price is resolved afterwards by the controller.
 */
export async function extractSale(message: string): Promise<ExtractedSale> {
  const model = createModel().withStructuredOutput(extractedSaleSchema, {
    name: "extracted_sale",
  });

  const result = await model.invoke([
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: message },
  ]);

  // The model's output is untrusted input; validate before anyone downstream
  // treats it as a sale.
  return extractedSaleSchema.parse(result);
}
