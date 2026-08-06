import type { Ref } from "react";

import type { DraftSale, PendingQuestion } from "../api";
import type { Message } from "../types/message";
import { AnswerChoices } from "./AnswerChoices";
import { ConfirmationCard } from "./ConfirmationCard";
import { ErrorBanner } from "./ErrorBanner";
import { MessageBubble } from "./MessageBubble";
import { ThinkingIndicator } from "./ThinkingIndicator";

/**
 * The scrolling conversation, plus whatever currently sits at the end of it.
 *
 * The card is rendered inside the transcript rather than pinned, so it scrolls
 * with the conversation that produced it. The always-reachable pair of buttons
 * is ConfirmGate's job.
 */
export function Transcript({
  messages,
  draft,
  question,
  awaiting,
  busy,
  error,
  onChoose,
  onConfirm,
  onCancel,
  cardRef,
  endRef,
}: {
  messages: Message[];
  draft: DraftSale | null;
  question: PendingQuestion | null;
  awaiting: boolean;
  busy: boolean;
  error: string | null;
  onChoose: (choiceId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  cardRef: Ref<HTMLDivElement>;
  endRef: Ref<HTMLDivElement>;
}) {
  return (
    <main className="transcript">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Hidden while a turn is in flight, so a slow reply cannot be answered
          twice by an impatient second click. */}
      {question && !busy && (
        <AnswerChoices question={question} busy={busy} onChoose={onChoose} />
      )}

      {awaiting && draft && (
        <ConfirmationCard
          ref={cardRef}
          draft={draft}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}

      {busy && <ThinkingIndicator />}

      {error && <ErrorBanner message={error} />}

      <div ref={endRef} />
    </main>
  );
}
