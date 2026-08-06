import { z } from "zod";

/**
 * Deliberately narrow. Running "2 litres" through the sale-extraction schema
 * would produce a fresh draft containing only oil and discard everything
 * already understood — exactly the restart F4 forbids. A schema that cannot
 * express a product or a customer cannot restart a sale, so "does not restart"
 * is a property of the type rather than a hope about the prompt.
 */
export const quantityAnswerSchema = z.object({
  quantity: z
    .number()
    .nullable()
    .describe("The amount stated, or null if the reply contains no amount"),
  unit: z.string().nullable().describe("The unit if stated, otherwise null"),
});

export type QuantityAnswer = z.infer<typeof quantityAnswerSchema>;
