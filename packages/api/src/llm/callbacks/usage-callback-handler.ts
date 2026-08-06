import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

import { recordCall } from "../../usage";

/**
 * Counts what this process has spent, alongside what Groq says is left.
 *
 * The two answer different questions and the meter shows both. The headers say
 * how much of the current minute's allowance remains — which is what tells the
 * owner whether the next sale will go through — but they are a reading from the
 * last call and say nothing about the shape of usage over a session. This
 * counts every model call and its tokens, so "how expensive is one sale?" is
 * answerable too.
 *
 * Separate from AgentCallbackHandler, which logs to the console and is off
 * unless AGENT_TRACE=1. This one must always run.
 */
export class UsageCallbackHandler extends BaseCallbackHandler {
  name = "sales-agent-usage";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleLLMEnd(output: any): void {
    const usage =
      output?.llmOutput?.tokenUsage ?? output?.llmOutput?.estimatedTokenUsage;
    recordCall("chat", Number(usage?.totalTokens ?? 0) || 0);
  }

  handleLLMError(): void {
    // A refused call still consumed a request against the quota.
    recordCall("chat", 0);
  }
}

const handler = new UsageCallbackHandler();

/** One shared instance; the handler holds no per-call state. */
export function usageCallbacks(): BaseCallbackHandler[] {
  return [handler];
}
