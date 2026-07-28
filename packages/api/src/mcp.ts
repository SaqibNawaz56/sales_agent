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
 * DEVIATION FROM THE PROPOSAL (§2, "Agent-exposed MCP tools"). The proposal
 * lists lookup_product, create_product and find_or_create_customer as tools the
 * agent calls. They are deliberately absent here. The controller calls all
 * three through its own MCP client, so no price and no catalogue fact ever
 * passes through the model — which makes R3 true by construction rather than by
 * instructing the model not to invent prices.
 *
 * The consequence is that the sale-capture flow advertises no tools at all: the
 * model does extraction only. The three read-only query tools join this set on
 * Day 5, and `health_check` is here as a harmless liveness probe used by the
 * verification scripts.
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

/**
 * Fetches one tool by name for the controller to invoke directly.
 *
 * This is the controller's own route to the MCP server — the same path that
 * will call `save_sale` after the owner confirms. Tools obtained here are
 * invoked by application code, never advertised to the model.
 */
export async function getServerTool(
  name: string,
): Promise<StructuredToolInterface> {
  const all = await loadAllTools();
  const tool = all.find((candidate) => bareName(candidate.name) === name);
  if (!tool) {
    throw new Error(`Tool "${name}" is not present on the MCP server.`);
  }
  return tool;
}

/** Invokes an MCP tool directly and parses its JSON response. */
export async function callServerTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const tool = await getServerTool(name);
  const raw = await tool.invoke(args);
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
}

export async function closeMcpClient(): Promise<void> {
  await client?.close();
  client = undefined;
}
