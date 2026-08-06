import { createModel } from "./create-model";
import { QUANTITY_ANSWER_PROMPT } from "./prompts";
import { quantityAnswerSchema, type QuantityAnswer } from "./schemas";

/** Reads an amount out of a reply to one specific clarification question. */
export async function parseQuantityAnswer(
  question: string,
  reply: string,
): Promise<QuantityAnswer> {
  const model = createModel("answer:quantity").withStructuredOutput(
    quantityAnswerSchema,
    { name: "quantity_answer" },
  );

  const result = await model.invoke([
    { role: "system", content: QUANTITY_ANSWER_PROMPT },
    {
      role: "user",
      content: `Question asked: "${question}"\nOwner replied: "${reply}"`,
    },
  ]);

  return quantityAnswerSchema.parse(result);
}
