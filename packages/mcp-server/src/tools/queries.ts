import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { prisma } from "../db.js";
import { normalize } from "../normalize.js";
import { defineTool } from "./define.js";

/**
 * The fixed, parameterised read tools (F10, R4).
 *
 * Three narrow queries rather than open-ended SQL generation. The model's only
 * job on the read side is choosing which of these to call — it never composes a
 * query, so it cannot produce one that is wrong, slow, or unsafe. Predictability
 * is valued over coverage: a question that maps to none of these gets "I can't
 * answer that", not an improvisation.
 */

function money(value: { toString(): string } | null): number {
  return value === null ? 0 : Number(value.toString());
}

export function registerQueryTools(server: McpServer): void {
  defineTool(
    server,
    {
      name: "query_daily_total",
      title: "Total sales for a day",
      description:
        "Returns the number of sales and the total amount taken on a given date. Defaults to today when no date is given.",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe("ISO date, YYYY-MM-DD. Defaults to today."),
      },
    },
    async (args) => {
      const { date } = z
        .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
        .parse(args);

      const day = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
      const start = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
      );
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);

      const result = await prisma.sale.aggregate({
        where: { soldAt: { gte: start, lt: end } },
        _sum: { totalAmount: true },
        _count: true,
      });

      return {
        date: start.toISOString().slice(0, 10),
        sales: result._count,
        total: money(result._sum.totalAmount),
      };
    },
  );

  defineTool(
    server,
    {
      name: "query_sales_by_customer",
      title: "What one customer has bought",
      description:
        "Returns how many sales a named customer has made and what they have spent in total.",
      inputSchema: {
        customerName: z.string().min(1).describe("The customer's name"),
      },
    },
    async (args) => {
      const { customerName } = z
        .object({ customerName: z.string().min(1) })
        .parse(args);

      const customer = await prisma.customer.findUnique({
        where: { normalizedName: normalize(customerName) },
      });

      // "Not found" is data, not an error — the caller phrases it for the owner.
      if (!customer) {
        return { found: false, customerName, sales: 0, total: 0 };
      }

      const result = await prisma.sale.aggregate({
        where: { customerId: customer.id },
        _sum: { totalAmount: true },
        _count: true,
      });

      return {
        found: true,
        customerName: customer.name,
        sales: result._count,
        total: money(result._sum.totalAmount),
      };
    },
  );

  defineTool(
    server,
    {
      name: "query_sales_by_product",
      title: "How much of one product has sold",
      description:
        "Returns the quantity sold and the revenue taken for a named product, across all sales.",
      inputSchema: {
        productName: z.string().min(1).describe("The product's name"),
      },
    },
    async (args) => {
      const { productName } = z
        .object({ productName: z.string().min(1) })
        .parse(args);

      const product = await prisma.product.findUnique({
        where: { normalizedName: normalize(productName) },
      });

      if (!product) {
        return { found: false, productName, quantity: 0, revenue: 0 };
      }

      const result = await prisma.saleItem.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true, lineTotal: true },
      });

      return {
        found: true,
        productName: product.name,
        unit: product.unit,
        // Revenue is summed from the snapshotted line totals, not from the
        // current catalogue price, so historical figures stay correct after a
        // price change (F7).
        quantity: money(result._sum.quantity),
        revenue: money(result._sum.lineTotal),
      };
    },
  );
}
