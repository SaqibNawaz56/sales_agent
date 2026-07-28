import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { prisma } from "../db.js";
import { findNearMatches } from "../match.js";
import { normalize } from "../normalize.js";
import { defineTool } from "./define.js";

export function registerCustomerTools(server: McpServer): void {
  defineTool(
    server,
    {
      name: "find_or_create_customer",
      title: "Find or create a customer",
      description:
        "Finds a customer by name. Creates the customer only when createIfMissing is explicitly true; otherwise reports the near matches so the caller can confirm before a new record is made.",
      inputSchema: {
        name: z.string().min(1).describe("Customer name as the owner said it"),
        createIfMissing: z
          .boolean()
          .optional()
          .describe(
            "Create the customer when no exact match exists. Defaults to false.",
          ),
      },
    },
    async (args) => {
      const { name, createIfMissing } = z
        .object({
          name: z.string().min(1).max(120),
          createIfMissing: z.boolean().optional().default(false),
        })
        .parse(args);

      const normalized = normalize(name);

      const exact = await prisma.customer.findUnique({
        where: { normalizedName: normalized },
      });

      if (exact) {
        return {
          found: true,
          created: false,
          customer: { id: exact.id, name: exact.name },
        };
      }

      // No exact match. Creation is gated deliberately: R2 requires that a new
      // customer is an explicit, confirmed action and never the silent side
      // effect of a typo, since a duplicate row fragments that customer's
      // entire purchase history. The default is therefore to report and wait.
      if (!createIfMissing) {
        const everyone = await prisma.customer.findMany({
          select: { id: true, name: true, normalizedName: true },
        });

        return {
          found: false,
          created: false,
          query: name,
          suggestions: findNearMatches(normalized, everyone).map((match) => ({
            id: match.id,
            name: match.name,
          })),
        };
      }

      const customer = await prisma.customer.create({
        data: { name, normalizedName: normalized },
      });

      return {
        found: false,
        created: true,
        customer: { id: customer.id, name: customer.name },
      };
    },
  );
}
