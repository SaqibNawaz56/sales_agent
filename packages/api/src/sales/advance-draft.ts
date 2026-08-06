import { resolveDraft } from "../catalogue";
import { runChecklist } from "../checklist";
import type { DraftSale } from "../draft";
import { buildQuestion } from "../questions";
import { formatSummary } from "../summary";
import { CONFIRM_PROMPT, type TurnResult } from "./sales.types";

/**
 * Runs resolution and the checklist, then either asks or presents.
 *
 * The single decision point of the whole write path, and the reason it is a
 * free function rather than a private method: it takes a draft and returns a
 * turn, touching no session state and no injected dependency. Everything it
 * decides is a consequence of what is in the draft, which is what makes the
 * controller's behaviour reproducible from a fixture.
 */
export async function advanceDraft(draft: DraftSale): Promise<TurnResult> {
  // The new-product sub-loop sets its own question, and the checklist knows
  // nothing about it — the checklist would see an unknown product and ask
  // "add it?" again, losing the yes the owner just gave.
  if (draft.pending?.kind === "new_product_price") {
    return {
      reply: draft.pending.question,
      draft,
      awaitingConfirmation: false,
      question: draft.pending.question,
    };
  }

  await resolveDraft(draft);
  const checklist = runChecklist(draft);

  if (checklist.firstGap !== null) {
    // One gap per turn. A combined question invites a combined answer, which
    // cannot be mapped back onto specific items reliably.
    draft.status = "building";
    draft.pending = buildQuestion(draft, checklist.firstGap);
    return {
      reply: draft.pending.question,
      draft,
      awaitingConfirmation: false,
      question: draft.pending.question,
    };
  }

  draft.pending = null;
  draft.status = "awaiting_confirmation";
  return {
    reply: `${formatSummary(draft)}\n\n${CONFIRM_PROMPT}`,
    draft,
    awaitingConfirmation: true,
    question: null,
  };
}
