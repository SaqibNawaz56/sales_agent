import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { prisma } from "./db.js";
import { defineTool } from "./tools/define.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerProductTools } from "./tools/products.js";
import { registerSaleTools } from "./tools/sales.js";

/**
 * Builds a server instance with every tool registered.
 *
 * Note that `save_sale` will live here alongside the read tools. Restricting it
 * is not the server's job — the server exposes everything. The protection comes
 * from the client's allowlist, which decides what the model is ever told about.
 * See AGENT_TOOL_ALLOWLIST in packages/api/src/mcp.ts and risk R7.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: "sales-agent-mcp",
    version: "0.1.0",
  });

  defineTool(
    server,
    {
      name: "health_check",
      title: "Health check",
      description:
        "Confirms the MCP server is reachable and can read the catalogue. Returns the number of products currently in the shop's product list.",
      inputSchema: {},
    },
    async () => {
      const products = await prisma.product.count();
      return { ok: true, products };
    },
  );

  registerProductTools(server);
  registerCustomerTools(server);
  registerSaleTools(server);

  return server;
}
