import { z } from "zod";

/**
 * Request shapes, as zod schemas rather than class-validator DTOs.
 *
 * WHY NOT DTO CLASSES. Nest's ValidationPipe discovers which class to validate
 * against by reading `design:paramtypes` — metadata that `emitDecoratorMetadata`
 * writes. esbuild does not implement that option, and `tsx watch` is what runs
 * this service in every container. Under it the pipe cannot see the DTO type,
 * so it validates nothing and silently passes the raw body through: a string
 * "true" reached the confirm branch, unknown fields were accepted, and an empty
 * sessionId was fine. Validation that disappears when the transpiler changes is
 * worse than none, because it reads as present.
 *
 * A schema passed explicitly to a pipe cannot vanish. If the schema is missing
 * the route does not compile — it fails closed, the same argument the tool
 * allowlist makes in mcp/agent-tool-allowlist.ts.
 *
 * zod is also what the rest of this codebase already validates with: every
 * model output in llm/schemas/ and every MCP tool input on the server.
 */

/** .strict() is the equivalent of ValidationPipe's forbidNonWhitelisted. */
export const chatSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
    message: z.string().trim().min(1, "message is required"),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatSchema>;

export const confirmSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
    /**
     * Deliberately a strict boolean, and deliberately not optional. A missing
     * flag must never be read as consent to write, and neither must the string
     * "true" — the Express version this replaced checked
     * `typeof confirmed !== "boolean"` for exactly that reason, and losing the
     * check was a real regression before this schema restored it.
     */
    confirmed: z.boolean({
      required_error: "confirmed must be true or false",
      invalid_type_error: "confirmed must be true or false",
    }),
  })
  .strict();

export type ConfirmRequest = z.infer<typeof confirmSchema>;

/**
 * A pressed answer button.
 *
 * `choiceId` is only ever echoed back from a choice this server issued; the
 * handler refuses any id that is not among the ones offered for the question
 * currently outstanding, so nothing here needs to enumerate valid values.
 */
export const answerSchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required"),
    choiceId: z.string().min(1, "choiceId is required"),
  })
  .strict();

export type AnswerRequest = z.infer<typeof answerSchema>;
