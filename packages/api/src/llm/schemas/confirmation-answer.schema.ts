import { z } from "zod";

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
