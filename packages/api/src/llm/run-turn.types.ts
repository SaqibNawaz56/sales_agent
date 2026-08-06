export interface ExecutedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface AgentTurn {
  reply: string;
  toolCalls: ExecutedToolCall[];
}
