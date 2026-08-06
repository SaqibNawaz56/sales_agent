import type { DraftSale, MissingQuantityQuestion } from "../draft";
import { parseQuantityAnswer } from "../llm";
import type { ApplyResult } from "./clarification.types";

/** Writes an amount onto the one item that was asked about, and nothing else. */
export async function applyQuantityAnswer(
  draft: DraftSale,
  pending: MissingQuantityQuestion,
  reply: string,
): Promise<ApplyResult> {
  const answer = await parseQuantityAnswer(pending.question, reply);

  if (answer.quantity === null) {
    // Leave the question standing rather than guessing. An invented quantity
    // is the R1 failure mode and would be invisible on the summary.
    return { understood: false, note: "I didn't catch an amount there." };
  }

  const item = draft.items[pending.itemIndex];
  item.quantity = answer.quantity;
  if (answer.unit !== null && item.rawUnit === null) {
    item.rawUnit = answer.unit;
  }

  draft.pending = null;
  return { understood: true };
}
