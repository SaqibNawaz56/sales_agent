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
    .enum(["log_sale", "query", "other"])
    .describe("What the owner is trying to do"),
  customer: z
    .string()
    .nullable()
    .describe("Who the goods were sold to, or null if not stated"),
  items: z.array(extractedItemSchema),
});

export type ExtractedSale = z.infer<typeof extractedSaleSchema>;
