import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { prisma } from "../db.js";
import { defineTool } from "./define.js";

/**
 * Everything one receipt needs, in a single call.
 *
 * CONTROLLER-ONLY, like lookup_product and find_or_create_customer, and for the
 * same reason: the payload carries a customer's real name and the exact prices
 * that customer was charged. Putting it on AGENT_TOOL_ALLOWLIST would hand the
 * model both, and undo the pseudonymisation the read path exists to provide.
 * The API calls this through its own MCP client when a receipt is downloaded.
 *
 * Every figure comes from the snapshot columns rather than the catalogue, so a
 * receipt reprinted next year still shows what was actually charged (F7).
 */
export function registerReceiptTools(server: McpServer): void {
  defineTool(
    server,
    {
      name: "get_sale_receipt",
      title: "One sale, in full",
      description:
        "Returns a single sale with its customer, its daily receipt number, and every line item at the price actually charged. Used to render a receipt. Never exposed to the model.",
      inputSchema: {
        saleId: z.number().int().positive().describe("The sale's id"),
      },
    },
    async (args) => {
      const { saleId } = z
        .object({ saleId: z.number().int().positive() })
        .parse(args);

      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: {
          customer: true,
          items: { include: { product: true }, orderBy: { id: "asc" } },
        },
      });

      // "Not found" is data, not an error — the caller turns it into a 404.
      if (!sale) return { found: false };

      return {
        found: true,
        saleId: sale.id,
        receiptNo: sale.receiptNo,
        receiptDate: sale.receiptDate.toISOString().slice(0, 10),
        soldAt: sale.soldAt.toISOString(),
        customer: { id: sale.customer.id, name: sale.customer.name },
        totalAmount: Number(sale.totalAmount.toString()),
        items: sale.items.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          unit: item.product.unit,
          quantity: Number(item.quantity.toString()),
          unitPrice: Number(item.unitPriceSnapshot.toString()),
          lineTotal: Number(item.lineTotal.toString()),
        })),
      };
    },
  );
}
