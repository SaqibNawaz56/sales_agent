import { createModel } from "./create-model";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts";
import { extractedSaleSchema, type ExtractedSale } from "./schemas";

/**
 * Turns one free-form sentence into structured data.
 *
 * No tools are bound here. Under the architecture boundary the model's entire
 * job in the capture flow is language understanding; every catalogue fact and
 * every price is resolved afterwards by the controller.
 */
export async function extractSale(message: string): Promise<ExtractedSale> {
  const model = createModel("extract").withStructuredOutput(
    extractedSaleSchema,
    { name: "extracted_sale" },
  );

  const result = await model.invoke([
    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
    { role: "user", content: message },
  ]);

  // The model's output is untrusted input; validate before anyone downstream
  // treats it as a sale.
  return extractedSaleSchema.parse(result);
}
