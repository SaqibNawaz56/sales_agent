import { getServerTool } from "./get-server-tool";

/** Invokes an MCP tool directly and parses its JSON response. */
export async function callServerTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const tool = await getServerTool(name);
  const raw = await tool.invoke(args);
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
}
