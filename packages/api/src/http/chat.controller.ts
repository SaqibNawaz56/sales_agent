import {
  BadGatewayException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from "@nestjs/common";

import { SaleService } from "../sales";
import { presentDraft, presentQuestion, presentReceipt } from "./present";
import {
  answerSchema,
  chatSchema,
  type AnswerRequest,
  type ChatRequest,
} from "./request.schemas";
import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * The conversation endpoints. Neither of them writes a sale.
 *
 * /api/chat takes what the owner typed. /api/answer takes a button he pressed
 * in reply to a question this server asked. They are separate routes because
 * they are separate kinds of input: one has to be interpreted by a model, and
 * the other must never be.
 */
@Controller("api")
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  /**
   * The token is passed explicitly rather than inferred from the parameter
   * type. Inference relies on `emitDecoratorMetadata`, and esbuild — which
   * `tsx` uses, and `tsx watch` is what runs this service in the container —
   * does not implement it. Under inference the metadata is simply absent, so
   * Nest constructs the controller with no arguments and every request fails
   * on `undefined.handle` at runtime rather than at boot.
   */
  constructor(@Inject(SaleService) private readonly sales: SaleService) {}

  /**
   * POST /api/chat  { sessionId, message }
   *
   * Everything except the write. A sale that becomes complete comes back with
   * awaitingConfirmation true and the itemised draft attached, for the client
   * to render as a confirmation card.
   */
  // Nest answers a POST with 201 by default. This endpoint creates nothing —
  // it returns the state of a draft — and the Express version it replaces
  // answered 200, which the integration tests assert.
  @Post("chat")
  @HttpCode(HttpStatus.OK)
  async chat(@Body(new ZodValidationPipe(chatSchema)) dto: ChatRequest) {
    try {
      const result = await this.sales.handle(dto.sessionId, dto.message);
      return {
        reply: result.reply,
        draftSale: presentDraft(result.draft),
        // A price-change confirmation has no draft to derive from, so it is
        // carried on the turn itself. Same shape on the wire either way, which
        // is why the client needs no change to render it.
        question: presentQuestion(result.draft) ?? result.pendingQuestion ?? null,
        awaitingConfirmation: result.awaitingConfirmation,
        // This endpoint still writes nothing. A receipt appears here when the
        // turn was a question about one past sale — "what did Ali buy last
        // time" — offering the receipt for the sale just described. Null
        // otherwise, which clears the link a previous answer left up.
        receipt: presentReceipt(result.receipt),
      };
    } catch (error) {
      this.logger.error("chat turn failed", error as Error);
      // The draft survives a failed turn — the owner retypes one line rather
      // than losing a half-built sale (R6).
      throw new BadGatewayException("The assistant is unavailable. Try again.");
    }
  }

  /**
   * POST /api/answer  { sessionId, choiceId }
   *
   * A pressed button, applied deterministically. No model is consulted: the
   * owner chose from options this server issued, so there is nothing to
   * interpret. Two of the branches it reaches end in a database write — adding
   * a customer, and opening the sub-loop that adds a product — which is the
   * reason this path exists at all.
   */
  @Post("answer")
  @HttpCode(HttpStatus.OK)
  async answer(@Body(new ZodValidationPipe(answerSchema)) dto: AnswerRequest) {
    try {
      const result = await this.sales.answer(dto.sessionId, dto.choiceId);
      return {
        reply: result.reply,
        draftSale: presentDraft(result.draft),
        // A price-change confirmation has no draft to derive from, so it is
        // carried on the turn itself. Same shape on the wire either way, which
        // is why the client needs no change to render it.
        question: presentQuestion(result.draft) ?? result.pendingQuestion ?? null,
        awaitingConfirmation: result.awaitingConfirmation,
      };
    } catch (error) {
      this.logger.error("answer failed", error as Error);
      throw new BadGatewayException("The assistant is unavailable. Try again.");
    }
  }
}
