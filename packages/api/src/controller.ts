import { applyAnswer } from "./apply.js";
import { runChecklist } from "./checklist.js";
import { emptyDraft, newItem, type DraftSale } from "./draft.js";
import { extractSale } from "./extract.js";
import { buildQuestion } from "./questions.js";
import { resolveDraft } from "./resolve.js";
import { getDraft, setDraft } from "./session.js";
import { formatSummary } from "./summary.js";

/**
 * The deterministic outer controller.
 *
 * This function decides what happens next — never the model. The model is asked
 * two narrow questions (what does this sentence say, what does this reply say)
 * and its answers are fed into a checklist that is plain code. Which question
 * to ask, when the sale is complete, and when to stop are all decided here.
 *
 * That division is the whole point of the architecture boundary in §2: an agent
 * loop decides its next action from the model's judgement, and a sale must not.
 */

export interface TurnResult {
  reply: string;
  draft: DraftSale | null;
  /** True when the draft is complete and only the owner's confirmation remains. */
  awaitingConfirmation: boolean;
  /** Set when the controller is waiting on an answer to a specific question. */
  question: string | null;
}

/** Runs resolution and the checklist, then either asks or presents. */
async function advance(draft: DraftSale): Promise<TurnResult> {
  await resolveDraft(draft);
  const checklist = runChecklist(draft);

  if (checklist.firstGap !== null) {
    // One gap per turn. A combined question invites a combined answer, which
    // cannot be mapped back onto specific items reliably.
    draft.pending = buildQuestion(draft, checklist.firstGap);
    return {
      reply: draft.pending.question,
      draft,
      awaitingConfirmation: false,
      question: draft.pending.question,
    };
  }

  draft.pending = null;
  return {
    reply: `${formatSummary(draft)}\n\nConfirm this sale?`,
    draft,
    awaitingConfirmation: true,
    question: null,
  };
}

export async function handleMessage(
  sessionId: string,
  message: string,
): Promise<TurnResult> {
  const existing = getDraft(sessionId);

  // A message arriving while a question is outstanding is an answer to that
  // question, not a new sale.
  if (existing && existing.pending) {
    const applied = await applyAnswer(existing, message);

    if (!applied.understood) {
      // Re-ask rather than advance. The gap is still there, so guessing past it
      // would put an invented value on the summary.
      setDraft(sessionId, existing);
      const note = applied.note ? `${applied.note} ` : "";
      return {
        reply: `${note}${existing.pending?.question ?? ""}`.trim(),
        draft: existing,
        awaitingConfirmation: false,
        question: existing.pending?.question ?? null,
      };
    }

    const result = await advance(existing);
    setDraft(sessionId, existing);
    if (applied.note) result.reply = `${applied.note}\n\n${result.reply}`;
    return result;
  }

  const extracted = await extractSale(message);

  if (extracted.intent === "query") {
    return {
      reply:
        "I can't answer questions about past sales yet — that's coming with the query tools. For now, tell me what you sold.",
      draft: null,
      awaitingConfirmation: false,
      question: null,
    };
  }

  if (extracted.intent !== "log_sale" || extracted.items.length === 0) {
    return {
      reply:
        "I didn't catch a sale in that. Tell me what you sold and to whom, for example: 2kg rice and 1 oil to Ali.",
      draft: null,
      awaitingConfirmation: false,
      question: null,
    };
  }

  // A new sale replaces any previous draft. Day 4 adds the confirmation gate,
  // after which a completed draft will be held until it is accepted or
  // rejected rather than silently discarded.
  const draft = emptyDraft(message);
  draft.customerName = extracted.customer;
  draft.items = extracted.items.map((item) =>
    newItem(item.product, item.quantity, item.unit),
  );

  const result = await advance(draft);
  setDraft(sessionId, draft);
  return result;
}
