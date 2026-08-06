import { z } from "zod";

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
