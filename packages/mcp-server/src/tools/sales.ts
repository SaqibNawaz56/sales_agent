import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../db.js";
import { defineTool } from "./define.js";

const saleItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive().finite().max(100_000),
  // The unit price the owner was actually shown on the confirmation summary.
  unitPrice: z.number().nonnegative().finite().max(10_000_000),
});

const saveSaleSchema = z.object({
  customerId: z.number().int().positive(),
  items: z.array(saleItemSchema).min(1),
});

/**
 * Registers the write tool.
 *
 * IMPORTANT: `save_sale` is registered here like any other tool, because the
 * server's job is to expose capability, not to police callers. It is kept away
 * from the model by AGENT_TOOL_ALLOWLIST in packages/api/src/mcp.ts — the model
 * is never told this tool exists, so it cannot request it (risk R7). Keeping it
 * on the server is what lets the audit trail capture every write, including the
 * controller's own.
 */
export function registerSaleTools(server: McpServer): void {
  defineTool(
    server,
    {
      name: "save_sale",
      title: "Save a confirmed sale",
      description:
        "Writes a confirmed sale and its line items in a single atomic transaction. Called only by the controller after the owner has explicitly confirmed. Never exposed to the model.",
      inputSchema: {
        customerId: z.number().int().positive(),
        items: z.array(saleItemSchema).min(1),
      },
    },
    async (args) => {
      const { customerId, items } = saveSaleSchema.parse(args);

      return prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
        });
        if (!customer) {
          throw new Error(`Customer ${customerId} does not exist.`);
        }

        const products = await tx.product.findMany({
          where: { id: { in: items.map((item) => item.productId) } },
        });
        const byId = new Map(products.map((product) => [product.id, product]));

        // Every price is re-checked against the catalogue inside the
        // transaction. The caller supplies the price the owner was shown, and
        // the server refuses to write anything else. This closes both failure
        // modes at once: a fabricated price cannot be persisted (R3), and a
        // catalogue price that changed while the owner was deciding cannot
        // silently rewrite what he approved.
        const mismatches: Array<{
          productId: number;
          confirmed: number;
          current: number;
        }> = [];

        for (const item of items) {
          const product = byId.get(item.productId);
          if (!product) {
            throw new Error(`Product ${item.productId} does not exist.`);
          }
          const current = Number(product.currentPrice.toString());
          if (current !== item.unitPrice) {
            mismatches.push({
              productId: item.productId,
              confirmed: item.unitPrice,
              current,
            });
          }
        }

        if (mismatches.length > 0) {
          throw new Error(
            `Catalogue prices changed since confirmation: ${JSON.stringify(
              mismatches,
            )}. Nothing was written; re-confirm the sale.`,
          );
        }

        // Decimal arithmetic throughout — binary floats cannot represent money
        // exactly and the error compounds across line items.
        let total = new Prisma.Decimal(0);
        const lineItems = items.map((item) => {
          const quantity = new Prisma.Decimal(item.quantity);
          const unitPrice = new Prisma.Decimal(item.unitPrice);
          const lineTotal = quantity.mul(unitPrice);
          total = total.add(lineTotal);
          return {
            productId: item.productId,
            quantity,
            // Snapshotted, not referenced: F7 and success criterion 9 require
            // this sale to keep reporting what it actually charged after the
            // catalogue price moves.
            unitPriceSnapshot: unitPrice,
            lineTotal,
          };
        });

        const sale = await tx.sale.create({
          data: {
            customerId,
            totalAmount: total,
            items: { create: lineItems },
          },
          include: { items: true },
        });

        return {
          saleId: sale.id,
          customer: { id: customer.id, name: customer.name },
          soldAt: sale.soldAt.toISOString(),
          totalAmount: Number(sale.totalAmount.toString()),
          items: sale.items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity.toString()),
            unitPrice: Number(item.unitPriceSnapshot.toString()),
            lineTotal: Number(item.lineTotal.toString()),
          })),
        };
      });
    },
  );
}
