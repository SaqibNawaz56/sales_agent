import { createModel } from "./create-model";
import { CONFIRMATION_ANSWER_PROMPT } from "./prompts";
import {
  confirmationAnswerSchema,
  type ConfirmationAnswer,
} from "./schemas";

/** Classifies a reply to a yes/no question, or captures the name given instead. */
export async function parseConfirmationAnswer(
  question: string,
  reply: string,
): Promise<ConfirmationAnswer> {
  const model = createModel("answer:confirm").withStructuredOutput(
    confirmationAnswerSchema,
    { name: "confirmation_answer" },
  );

  const result = await model.invoke([
    { role: "system", content: CONFIRMATION_ANSWER_PROMPT },
    {
      role: "user",
      content: `Question asked: "${question}"\nOwner replied: "${reply}"`,
    },
  ]);

  return confirmationAnswerSchema.parse(result);
}
