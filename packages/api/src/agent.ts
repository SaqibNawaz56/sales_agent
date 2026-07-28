import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { createModel } from "./model.js";

export interface ExecutedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface AgentTurn {
  reply: string;
  toolCalls: ExecutedToolCall[];
}

/**
 * One bounded model turn: invoke, execute any requested tools, invoke again to
 * let the model phrase the result.
 *
 * Deliberately not an autonomous agent loop. The architecture boundary in the
 * proposal puts business decisions in the controller, not the model, so what is
 * needed here is a primitive the controller drives — not a loop that decides
 * for itself when it is finished. Day 2 builds on this rather than replacing it
 * with createAgent.
 */
export async function runTurn(
  messages: BaseMessage[],
  tools: StructuredToolInterface[],
): Promise<AgentTurn> {
  const model = createModel().bindTools(tools);
  const history: BaseMessage[] = [...messages];

  const first = (await model.invoke(history)) as AIMessage;
  history.push(first);

  const requested = first.tool_calls ?? [];
  if (requested.length === 0) {
    return { reply: String(first.content), toolCalls: [] };
  }

  const executed: ExecutedToolCall[] = [];
  for (const call of requested) {
    const tool = tools.find((candidate) => candidate.name === call.name);

    // A model can request a tool that was never advertised. Refusing here keeps
    // that from becoming an exception, and keeps the allowlist authoritative.
    if (!tool) {
      const message = `Tool "${call.name}" is not available.`;
      history.push(
        new ToolMessage({
          content: message,
          tool_call_id: call.id ?? call.name,
          name: call.name,
        }),
      );
      executed.push({ name: call.name, args: call.args, result: message });
      continue;
    }

    // Models routinely emit `null` rather than `{}` for a no-argument tool, and
    // the adapter's schema rejects it. Normalising here keeps that provider
    // quirk from surfacing as a tool failure.
    const args =
      call.args && typeof call.args === "object" ? call.args : {};

    const raw = await tool.invoke(args);
    const result = typeof raw === "string" ? raw : JSON.stringify(raw);

    history.push(
      new ToolMessage({
        content: result,
        tool_call_id: call.id ?? call.name,
        name: call.name,
      }),
    );
    executed.push({ name: call.name, args: call.args, result });
  }

  const final = (await model.invoke(history)) as AIMessage;
  return { reply: String(final.content), toolCalls: executed };
}
