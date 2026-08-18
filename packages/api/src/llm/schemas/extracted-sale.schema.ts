import { z } from "zod";

/**
 * What the model is allowed to produce from a sale sentence.
 *
 * Note what is absent: there is no price field anywhere. The model is never
 * asked for one and has no place to put one, so a hallucinated price cannot
 * even be expressed, let alone persisted (risk R3). Prices are resolved by the
 * controller against the catalogue after extraction.
 */
export const extractedItemSchema = z.object({
  product: z.string().describe("Product name only, without quantity or unit"),
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
    .enum(["log_sale", "query", "change_price", "other"])
    .describe("What the owner is trying to do"),
  customer: z
    .string()
    .nullable()
    .describe("Who the goods were sold to, or null if not stated"),
  /**
   * The product whose price is being changed. Set only for "change_price", and
   * deliberately just a NAME — note there is still no price field anywhere in
   * this schema. The new figure is read from the same sentence afterwards by
   * priceAnswerSchema, which is the one narrow shape allowed to carry money.
   * Routing a price through here instead would give the sale-extraction model a
   * place to put an invented one, which is exactly what R3 forbids.
   */
  product: z
    .string()
    .nullable()
    .describe("For change_price: the product being repriced. null otherwise."),
  items: z.array(extractedItemSchema),
});

export type ExtractedSale = z.infer<typeof extractedSaleSchema>;
