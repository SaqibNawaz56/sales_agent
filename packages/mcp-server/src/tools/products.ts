import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { prisma } from "../db.js";
import { findNearMatches } from "../match.js";
import { normalize, toDisplayName } from "../normalize.js";
import { defineTool } from "./define.js";

/** Prisma Decimal does not serialise usefully to JSON; send plain numbers. */
function money(value: { toString(): string }): number {
  return Number(value.toString());
}

export function registerProductTools(server: McpServer): void {
  defineTool(
    server,
    {
      name: "lookup_product",
      title: "Look up a product",
      description:
        "Finds a product in the shop's catalogue by name and returns its unit and current price. Returns found:false with near-matching suggestions when the product is not in the catalogue.",
      inputSchema: {
        name: z.string().min(1).describe("The product name as the owner said it"),
      },
    },
    async (args) => {
      const { name } = z.object({ name: z.string().min(1) }).parse(args);
      const normalized = normalize(name);

      const exact = await prisma.product.findUnique({
        where: { normalizedName: normalized },
      });

      if (exact) {
        return {
          found: true,
          product: {
            id: exact.id,
            name: exact.name,
            unit: exact.unit,
            currentPrice: money(exact.currentPrice),
          },
        };
      }

      // Not found is a normal outcome, not an error: it is the trigger for the
      // new-product sub-loop (F5). Suggestions let the caller ask "did you mean
      // sugar?" instead of silently creating a duplicate row (R2).
      const catalogue = await prisma.product.findMany({
        select: { id: true, name: true, normalizedName: true, unit: true },
      });

      return {
        found: false,
        query: name,
        normalizedQuery: normalized,
        suggestions: findNearMatches(normalized, catalogue).map((match) => ({
          id: match.id,
          name: match.name,
          unit: match.unit,
        })),
      };
    },
  );

  defineTool(
    server,
    {
      name: "create_product",
      title: "Add a product to the catalogue",
      description:
        "Adds a new product with the price supplied by the shop owner. This is the only route by which a price enters the system.",
      inputSchema: {
        name: z.string().min(1).describe("Product name as the owner said it"),
        unit: z.string().min(1).describe("Unit of sale, e.g. kg, litre, piece"),
        price: z.number().positive().describe("Unit price supplied by the owner"),
      },
    },
    async (args) => {
      const { name, unit, price } = z
        .object({
          name: z.string().min(1),
          unit: z.string().min(1),
          // Guards against a misparsed quantity landing in the price column.
          price: z.number().positive().finite().max(10_000_000),
        })
        .parse(args);

      const normalized = normalize(name);

      // Creating an existing product is treated as a no-op rather than an
      // error, so a retry mid-conversation cannot fail the sale.
      const existing = await prisma.product.findUnique({
        where: { normalizedName: normalized },
      });

      if (existing) {
        return {
          created: false,
          reason: "already in catalogue",
          product: {
            id: existing.id,
            name: existing.name,
            unit: existing.unit,
            currentPrice: money(existing.currentPrice),
          },
        };
      }

      const product = await prisma.product.create({
        data: {
          // Stored title-cased so a product added mid-sale sits consistently
          // alongside the seeded catalogue.
          name: toDisplayName(name),
          normalizedName: normalized,
          unit: normalize(unit),
          currentPrice: price,
        },
      });

      return {
        created: true,
        product: {
          id: product.id,
          name: product.name,
          unit: product.unit,
          currentPrice: money(product.currentPrice),
        },
      };
    },
  );
}
