/**
 * Day 1 "done when": the model calls a tool that lives on a separate MCP
 * process and gets a result back.
 *
 * The question below cannot be answered from the model's own knowledge — the
 * product count exists only in this shop's database — so a correct answer is
 * only reachable through the MCP round-trip.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { runTurn } from "../agent.js";
import { closeMcpClient, loadAgentTools, loadAllTools } from "../mcp.js";

async function main(): Promise<void> {
  const everything = await loadAllTools();
  const advertised = await loadAgentTools();

  console.log(
    "tools on the MCP server :",
    everything.map((tool) => tool.name).join(", "),
  );
  console.log(
    "tools advertised to LLM :",
    advertised.map((tool) => tool.name).join(", "),
  );

  const turn = await runTurn(
    [
      new SystemMessage(
        "You are the assistant for a small shop. Answer using the tools available to you. Never guess a number that a tool can tell you.",
      ),
      new HumanMessage(
        "Is the sales system healthy, and how many products are in my catalogue?",
      ),
    ],
    advertised,
  );

  console.log("tool calls executed     :", JSON.stringify(turn.toolCalls));
  console.log("final reply             :", turn.reply);

  await closeMcpClient();

  const calledTheTool = turn.toolCalls.some((call) =>
    call.name.includes("health_check"),
  );
  if (!calledTheTool) {
    console.error("FAILED: the model did not call health_check");
    process.exit(1);
  }
  console.log("agent -> MCP round-trip OK");
}

main().catch((error) => {
  console.error("prove-agent FAILED:", error);
  process.exit(1);
});
