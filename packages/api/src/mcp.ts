import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";

const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp";

/**
 * The tools the LLM is permitted to see.
 *
 * This is an ALLOWLIST, not a denylist, and that is the whole point. The
 * proposal (R7) describes filtering `save_sale` out of the advertised set; an
 * allowlist is strictly stronger, because any tool later added to the MCP
 * server is invisible to the model until someone deliberately names it here.
 * A denylist fails open — forget to add an entry and a write tool silently
 * becomes callable. This fails closed.
 *
 * `save_sale` must never appear in this set. It is reached only by the
 * controller's own client, from the confirm endpoint.
 */
export const AGENT_TOOL_ALLOWLIST = new Set<string>(["health_check"]);

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

/** The adapter may namespace tools as "<server>__<tool>". */
function bareName(name: string): string {
  const separator = name.lastIndexOf("__");
  return separator === -1 ? name : name.slice(separator + 2);
}

/** Every tool the server exposes. For the controller only — never the model. */
export async function loadAllTools(): Promise<StructuredToolInterface[]> {
  return getMcpClient().getTools();
}

/** The filtered subset handed to the LLM. */
export async function loadAgentTools(): Promise<StructuredToolInterface[]> {
  const all = await loadAllTools();
  return all.filter((tool) => AGENT_TOOL_ALLOWLIST.has(bareName(tool.name)));
}

export async function closeMcpClient(): Promise<void> {
  await client?.close();
  client = undefined;
}
