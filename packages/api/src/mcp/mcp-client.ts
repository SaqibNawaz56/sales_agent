import { MultiServerMCPClient } from "@langchain/mcp-adapters";

/**
 * The MCP connection singleton.
 *
 * getMcpClient and closeMcpClient share the `client` binding below, so they
 * stay in one file: they are not two independent functions but two operations
 * on one piece of process state, and splitting them would mean exporting a
 * mutable variable across a module boundary.
 */

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp";

let client: MultiServerMCPClient | undefined;

export function getMcpClient(): MultiServerMCPClient {
  client ??= new MultiServerMCPClient({
    mcpServers: {
      sales: {
        url: MCP_SERVER_URL,
        transport: "http",
      },
    },
  });
  return client;
}

export async function closeMcpClient(): Promise<void> {
  await client?.close();
  client = undefined;
}
