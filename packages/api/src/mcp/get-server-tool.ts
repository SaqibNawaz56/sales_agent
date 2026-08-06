import type { StructuredToolInterface } from "@langchain/core/tools";

import { bareName } from "./bare-name";
import { loadAllTools } from "./load-all-tools";

/**
 * Fetches one tool by name for the controller to invoke directly.
 *
 * This is the controller's own route to the MCP server — the same path that
 * calls `save_sale` after the owner confirms. Tools obtained here are invoked
 * by application code, never advertised to the model.
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
