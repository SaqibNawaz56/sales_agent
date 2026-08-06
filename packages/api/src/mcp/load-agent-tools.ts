import type { StructuredToolInterface } from "@langchain/core/tools";

import { AGENT_TOOL_ALLOWLIST } from "./agent-tool-allowlist";
import { bareName } from "./bare-name";
import { loadAllTools } from "./load-all-tools";

/** The filtered subset handed to the LLM. */
export async function loadAgentTools(): Promise<StructuredToolInterface[]> {
  const all = await loadAllTools();
  return all.filter((tool) => AGENT_TOOL_ALLOWLIST.has(bareName(tool.name)));
}
