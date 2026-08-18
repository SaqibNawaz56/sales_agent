import { createStructuredModel } from "./create-model";
import { PRICE_ANSWER_PROMPT } from "./prompts";
import { priceAnswerSchema, type PriceAnswer } from "./schemas";

/**
 * Reads the price the owner stated for a product he is adding.
 *
 * The single model call on the write path that produces a number which becomes
 * money in the database (F5, R3). Everywhere else a price comes from the
 * catalogue.
 */
export async function parsePriceAnswer(
  question: string,
  reply: string,
): Promise<PriceAnswer> {
  const model = createStructuredModel(
    priceAnswerSchema,
    "price_answer",
    "answer:price",
  );

  const result = await model.invoke([
    { role: "system", content: PRICE_ANSWER_PROMPT },
    {
      role: "user",
      content: `Question asked: "${question}"\nOwner replied: "${reply}"`,
    },
  ]);

  return priceAnswerSchema.parse(result);
}
