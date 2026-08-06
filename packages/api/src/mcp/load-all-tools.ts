import type { StructuredToolInterface } from "@langchain/core/tools";

import { getMcpClient } from "./mcp-client";

/** Every tool the server exposes. For the controller only — never the model. */
export async function loadAllTools(): Promise<StructuredToolInterface[]> {
  return getMcpClient().getTools();
}
