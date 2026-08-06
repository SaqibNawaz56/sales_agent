import type { Message } from "../types/message";

export function MessageBubble({ message }: { message: Message }) {
  return <div className={`bubble ${message.from}`}>{message.text}</div>;
}
