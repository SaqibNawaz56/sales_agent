import {
  BadGatewayException,
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { buildReceiptModel, fetchReceipt, renderReceiptPdf } from "../receipt";
import { saleIdParamSchema, type SaleIdParam } from "./request.schemas";
import { ZodValidationPipe } from "./zod-validation.pipe";

/**
 * GET /api/sales/:id/receipt  ->  application/pdf
 *
 * A controller of its own rather than another method on SalesController, which
 * documents itself as the one endpoint that writes a sale. This one only reads,
 * and keeping the write endpoint's file free of anything else is what makes
 * that claim checkable by opening the file.
 *
 * Works for any sale, not only the one just confirmed. A receipt the owner can
 * only ever download once — before he closes the tab — is not much of a
 * receipt, and the sale is a permanent record either way.
 */
@Controller("api/sales")
export class ReceiptController {
  private readonly logger = new Logger(ReceiptController.name);

  @Get(":id/receipt")
  @Header("Content-Type", "application/pdf")
  // No-store: a receipt carries a customer's name and what they were charged,
  // and this response is not something a shared proxy should be holding on to.
  @Header("Cache-Control", "no-store")
  async receipt(
    @Param(new ZodValidationPipe(saleIdParamSchema)) params: SaleIdParam,
    @Res() response: Response,
  ): Promise<void> {
    const sale = await this.load(params.id);

    if (!sale.found) {
      throw new NotFoundException(`No sale with id ${params.id}.`);
    }

    const model = buildReceiptModel(sale);
    const pdf = await renderReceiptPdf(model);

    // `attachment` rather than `inline`: the owner asked for a file he can keep
    // and send on, so it should land in Downloads rather than in a tab.
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${model.filename}"`,
    );
    response.setHeader("Content-Length", pdf.length);
    response.end(pdf);
  }

  /**
   * A missing sale and an unreachable MCP server are different answers, and
   * collapsing them would tell the owner his sale does not exist when in fact
   * the database is simply down.
   */
  private async load(saleId: number) {
    try {
      return await fetchReceipt(saleId);
    } catch (error) {
      this.logger.error(`receipt lookup failed for sale ${saleId}`, error as Error);
      throw new BadGatewayException("The receipt could not be produced.");
    }
  }
}
