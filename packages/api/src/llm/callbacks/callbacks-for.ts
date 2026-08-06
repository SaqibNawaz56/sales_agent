import { AgentCallbackHandler } from "./agent-callback-handler";

/** Off by default; noisy in tests, useful when watching a demo. */
export function callbacksFor(label: string) {
  if (process.env.AGENT_TRACE !== "1") return undefined;
  return [new AgentCallbackHandler(label)];
}
