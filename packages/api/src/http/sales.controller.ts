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
import { presentDraft, presentQuestion } from "./present";
import { confirmSchema, type ConfirmRequest } from "./request.schemas";
import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * POST /api/sales/confirm  { sessionId, confirmed }
 *
 * The ONLY endpoint that writes a sale. Separated from /api/chat on purpose:
 * the state-changing action gets its own explicit route, so the gate is visible
 * in the API surface itself rather than being one possible outcome of sending a
 * message. Keeping it in its own @Controller preserves that — the write lives
 * at a route prefix of its own, which is also the natural place to hang a
 * @UseGuards() if this shop ever grows more than one operator.
 */
@Controller("api/sales")
export class SalesController {
  private readonly logger = new Logger(SalesController.name);

  // Explicit token — see the note in chat.controller.ts. esbuild does not emit
  // the type metadata Nest would otherwise infer from.
  constructor(@Inject(SaleService) private readonly sales: SaleService) {}

  // 200, not Nest's default 201 — this endpoint answers both "saved" and
  // "cancelled", and a 201 on a cancellation would be a lie.
  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Body(new ZodValidationPipe(confirmSchema)) dto: ConfirmRequest,
  ) {
    try {
      const result = dto.confirmed
        ? await this.sales.confirm(dto.sessionId)
        : this.sales.cancel(dto.sessionId);

      return {
        reply: result.reply,
        draftSale: presentDraft(result.draft),
        question: presentQuestion(result.draft),
        awaitingConfirmation: result.awaitingConfirmation,
        saved: dto.confirmed && result.draft === null,
      };
    } catch (error) {
      this.logger.error("confirm failed", error as Error);
      throw new BadGatewayException("The sale could not be saved. Try again.");
    }
  }
}
