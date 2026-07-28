import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { prisma } from "./db.js";

/**
 * Builds a server instance with the tools registered.
 *
 * Day 1 carries a single trivial tool. It deliberately touches the database
 * rather than echoing a string, so a successful round-trip proves the whole
 * spine at once: transport, tool dispatch, Prisma engine, and the container's
 * network route to Postgres.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: "sales-agent-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "health_check",
    {
      title: "Health check",
      description:
        "Confirms the MCP server is reachable and can read the catalogue. Returns the number of products currently in the shop's product list.",
      inputSchema: {},
    },
    async () => {
      const products = await prisma.product.count();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, products }),
          },
        ],
      };
    },
  );

  return server;
}
