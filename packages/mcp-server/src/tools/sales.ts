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
 * The UTC day a moment falls in, as a midnight Date.
 *
 * UTC deliberately, matching query_daily_total: if receipt numbering and daily
 * totals disagreed about where a day ends, the third receipt of the day and the
 * third sale in the day's total could be different sales.
 */
function utcDayOf(moment: Date): Date {
  return new Date(
    Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()),
  );
}

/** Postgres unique-violation, as Prisma reports it. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

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

      // Reading the day's highest receipt number and adding one is a
      // read-then-write, so two sales confirmed in the same instant can both
      // land on the same number. The unique index refuses the second; this
      // retries it, which picks up the number the winner just took. Three
      // attempts is far more than a one-operator shop can ever need, and
      // failing after that is better than looping.
      for (let attempt = 1; ; attempt++) {
        try {
          return await writeSale(customerId, items);
        } catch (error) {
          if (attempt >= 3 || !isUniqueViolation(error)) throw error;
        }
      }
    },
  );
}

async function writeSale(
  customerId: number,
  items: z.infer<typeof saleItemSchema>[],
) {
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

    // Every price is re-checked against the catalogue inside the transaction.
    // The caller supplies the price the owner was shown, and the server refuses
    // to write anything else. This closes both failure modes at once: a
    // fabricated price cannot be persisted (R3), and a catalogue price that
    // changed while the owner was deciding cannot silently rewrite what he
    // approved.
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
        // Snapshotted, not referenced: F7 and success criterion 9 require this
        // sale to keep reporting what it actually charged after the catalogue
        // price moves.
        unitPriceSnapshot: unitPrice,
        lineTotal,
      };
    });

    // The receipt number is assigned inside this same transaction, so a sale
    // and the number on its receipt come into existence together — there is no
    // window in which a written sale has no receipt.
    //
    // soldAt is set explicitly rather than left to the column default, because
    // receiptDate is derived from it. Letting the default supply a second,
    // marginally later instant would allow a sale timestamped 23:59:59.999 to
    // carry the next day's receipt date.
    const soldAt = new Date();
    const receiptDate = utcDayOf(soldAt);
    const highest = await tx.receipt.aggregate({
      where: { receiptDate },
      _max: { receiptNo: true },
    });
    const receiptNo = (highest._max.receiptNo ?? 0) + 1;

    const sale = await tx.receipt.create({
      data: {
        customerId,
        totalAmount: total,
        soldAt,
        receiptDate,
        receiptNo,
        items: { create: lineItems },
      },
      include: { items: true },
    });

    return {
      saleId: sale.id,
      customer: { id: customer.id, name: customer.name },
      soldAt: sale.soldAt.toISOString(),
      receiptNo: sale.receiptNo,
      receiptDate: sale.receiptDate.toISOString().slice(0, 10),
      totalAmount: Number(sale.totalAmount.toString()),
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity.toString()),
        unitPrice: Number(item.unitPriceSnapshot.toString()),
        lineTotal: Number(item.lineTotal.toString()),
      })),
    };
  });
}
