import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";

/**
 * Client-side observability for the LangChain layer.
 *
 * This complements the server-side logging in tool_call_logs rather than
 * duplicating it. The two see different things:
 *
 *   - The MCP server logs every TOOL call, from any client, including the
 *     controller's own save_sale. That is the audit trail (F11).
 *   - This handler logs every MODEL call — which prompt ran, how long it took,
 *     how many tokens it cost, and any tool the model asked for. None of that
 *     reaches the server, because a model call is not a tool call.
 *
 * The token counts are the practically useful part: Groq's free tier allows
 * 12,000 tokens per minute (R6), and this is what makes it visible when a
 * conversation is approaching that.
 */
export class AgentCallbackHandler extends BaseCallbackHandler {
  name = "hisaab-callbacks";

  private started = new Map<string, number>();

  constructor(private readonly label: string) {
    super();
  }

  handleLLMStart(_llm: Serialized, prompts: string[], runId: string): void {
    this.started.set(runId, Date.now());
    const preview = (prompts[0] ?? "").replace(/\s+/g, " ").slice(0, 80);
    console.log(`[llm:start] ${this.label} "${preview}..."`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleLLMEnd(output: any, runId: string): void {
    const started = this.started.get(runId);
    const ms = started ? Date.now() - started : -1;
    this.started.delete(runId);

    const usage =
      output?.llmOutput?.tokenUsage ?? output?.llmOutput?.estimatedTokenUsage;
    const tokens = usage?.totalTokens;

    console.log(
      `[llm:end]   ${this.label} ${ms}ms${tokens ? ` ${tokens} tokens` : ""}`,
    );
  }

  handleLLMError(error: Error, runId: string): void {
    this.started.delete(runId);
    // Rate limits are expected under load rather than exceptional, so they are
    // labelled as such instead of looking like a crash.
    const rateLimited = /rate.?limit|429/i.test(error.message);
    console.log(
      `[llm:error] ${this.label} ${rateLimited ? "RATE LIMITED" : error.message}`,
    );
  }

  handleToolStart(tool: Serialized, input: string): void {
    const name = (tool as { name?: string }).name ?? "unknown";
    console.log(`[tool:start] ${name} ${input.slice(0, 80)}`);
  }

  handleToolEnd(output: unknown): void {
    console.log(`[tool:end]   ${String(output).slice(0, 80)}`);
  }
}
