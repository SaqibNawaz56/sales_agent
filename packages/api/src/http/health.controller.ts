import { BadGatewayException, Controller, Get, Logger } from "@nestjs/common";

import { loadAgentTools } from "../mcp";

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  @Get("healthz")
  health() {
    return { ok: true };
  }

  /**
   * Reports what the agent can actually see. Used by the verification scripts
   * to assert that save_sale is not advertised (criterion 13).
   */
  @Get("api/tools")
  async tools() {
    try {
      const tools = await loadAgentTools();
      return { tools: tools.map((tool) => tool.name) };
    } catch (error) {
      this.logger.error("failed to load agent tools", error as Error);
      throw new BadGatewayException("MCP server unreachable");
    }
  }
}
