import type { PendingQuestion } from "../api";

/**
 * The buttons that answer a yes/no or which-one question.
 *
 * Rendered under the agent's message rather than inside it, so the question
 * still reads as something the assistant said and the actions read as the
 * owner's. Typing an answer keeps working — these are an additional way to
 * reply, not a replacement — because a suggestion list cannot cover every
 * correction the owner might want to make.
 *
 * Pressing one of these can add a customer or open the flow that adds a
 * product, both of which write to the database. That is the reason they exist:
 * until now those two writes were gated on a model classifying the word "yes".
 */
export function AnswerChoices({
  question,
  busy,
  onChoose,
}: {
  question: PendingQuestion;
  busy: boolean;
  onChoose: (choiceId: string) => void;
}) {
  if (question.choices.length === 0) return null;

  return (
    <div className="choices" role="group" aria-label="Answer">
      {question.choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          className={`choice ${choice.intent}`}
          onClick={() => onChoose(choice.id)}
          disabled={busy}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
