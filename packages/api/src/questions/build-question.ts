import type { GapLocation } from "../checklist";
import type { DraftSale, PendingQuestion } from "../draft";
import { buildCustomerQuestion } from "./build-customer-question";
import {
  buildQuantityQuestion,
  buildUnknownProductQuestion,
} from "./build-item-question";

/**
 * Turns a checklist gap into the question to ask.
 *
 * Templates, not a model call. The question is a consequence of a known gap, so
 * generating it is deterministic work — asking the LLM to phrase it would add
 * latency and token cost, spend budget against Groq's per-minute limit, and
 * introduce variability into the one part of the conversation that should be
 * predictable. It also keeps F4 honest: the question is built from the specific
 * item index the checklist identified, so it cannot drift onto another item.
 *
 * This function is only the dispatch. Each question's wording lives with the
 * others of its kind, so a change to how the shop talks about customers cannot
 * accidentally alter how it talks about quantities.
 */
export function buildQuestion(
  draft: DraftSale,
  gap: GapLocation,
): PendingQuestion {
  if (gap.kind === "customer") {
    return buildCustomerQuestion(draft);
  }

  const index = gap.itemIndex as number;
  const item = draft.items[index];

  if (gap.kind === "missing_quantity") {
    return buildQuantityQuestion(item, index);
  }

  return buildUnknownProductQuestion(item, index);
}
