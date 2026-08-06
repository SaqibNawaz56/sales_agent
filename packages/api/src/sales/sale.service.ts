import { Inject, Injectable } from "@nestjs/common";

import { applyAnswer, applyChoice } from "../clarification";
import { emptyDraft, newItem } from "../draft";
import { extractSale } from "../llm";
import { callServerTool } from "../mcp";
import { answerQuery } from "../reporting";
import { SessionStore } from "../session";
import { formatSummary } from "../summary";
import { advanceDraft } from "./advance-draft";
import {
  CONFIRM_PROMPT,
  type SaveSaleResult,
  type TurnResult,
} from "./sales.types";

/**
 * The deterministic outer controller.
 *
 * This service decides what happens next — never the model. The model is asked
 * two narrow questions (what does this sentence say, what does this reply say)
 * and its answers are fed into a checklist that is plain code. Which question
 * to ask, when the sale is complete, and when to stop are all decided here.
 *
 * That division is the whole point of the architecture boundary in §2: an agent
 * loop decides its next action from the model's judgement, and a sale must not.
 *
 * Naming note: "controller" in the proposal means this — the deterministic
 * outer loop — not Nest's @Controller, which is the HTTP edge in src/http/.
 * This class is a provider; the HTTP controllers depend on it.
 */
@Injectable()
export class SaleService {
  // Explicit token — see the note in http/chat.controller.ts. esbuild does not
  // emit the type metadata Nest would otherwise infer from.
  constructor(@Inject(SessionStore) private readonly sessions: SessionStore) {}

  /**
   * Writes the sale. The ONLY call site of save_sale in the entire system.
   *
   * Reached only from an explicit confirmation by the owner — never from
   * handle(), and never from anything the model produced. The model is not told
   * this tool exists (see mcp/agent-tool-allowlist.ts), so the write is not
   * merely discouraged for the agent, it is unreachable. That is risk R7's
   * mitigation and the second half of success criterion 13.
   *
   * The unit prices sent here are the ones the owner was shown on the summary.
   * save_sale re-checks each against the catalogue inside its transaction and
   * refuses the write if any has moved, so what is saved is exactly what was
   * approved.
   */
  async confirm(sessionId: string): Promise<TurnResult> {
    const draft = this.sessions.get(sessionId);

    if (!draft) {
      return {
        reply: "There's no sale to confirm.",
        draft: null,
        awaitingConfirmation: false,
        question: null,
      };
    }

    if (draft.status !== "awaiting_confirmation") {
      // Refusing here matters: confirming a draft that still has gaps would
      // write a sale the owner never saw a total for.
      return {
        reply: `That sale isn't finished yet. ${draft.pending?.question ?? ""}`.trim(),
        draft,
        awaitingConfirmation: false,
        question: draft.pending?.question ?? null,
      };
    }

    if (draft.customerId === null) {
      return {
        reply: "I still don't know who this sale is for.",
        draft,
        awaitingConfirmation: true,
        question: null,
      };
    }

    const items = draft.items.map((item) => ({
      productId: item.productId as number,
      quantity: item.quantity as number,
      unitPrice: item.unitPrice as number,
    }));

    try {
      const saved = await callServerTool<SaveSaleResult>("save_sale", {
        customerId: draft.customerId,
        items,
      });

      if (saved.error || saved.saleId === undefined) {
        // The draft is kept so the owner can retry or cancel rather than lose it.
        return {
          reply: `The sale was not saved: ${saved.error ?? "unknown error"}`,
          draft,
          awaitingConfirmation: true,
          question: null,
        };
      }

      this.sessions.clear(sessionId);
      return {
        reply: `Saved. Sale #${saved.saleId} — ${saved.totalAmount} to ${saved.customer?.name ?? draft.customerName}.`,
        draft: null,
        awaitingConfirmation: false,
        question: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        reply: `The sale was not saved: ${message}`,
        draft,
        awaitingConfirmation: true,
        question: null,
      };
    }
  }

  /**
   * Discards a draft without writing anything (F8).
   *
   * Nothing to roll back — no sale row has ever existed. Note that a product
   * added during this conversation stays in the catalogue: adding it was its own
   * confirmed action, and the shop does now stock it.
   */
  cancel(sessionId: string): TurnResult {
    const draft = this.sessions.get(sessionId);
    this.sessions.clear(sessionId);

    return {
      reply: draft
        ? "Discarded. Nothing was saved."
        : "There was no sale in progress.",
      draft: null,
      awaitingConfirmation: false,
      question: null,
    };
  }

  /**
   * Applies a pressed answer button.
   *
   * The sibling of handle() for the case where the owner did not type anything.
   * It deliberately refuses to fall through to extraction: if there is no
   * question outstanding there is nothing a button could be answering, and
   * inventing a turn from a stale click is how a draft gets mutated by a
   * double-tap.
   */
  async answer(sessionId: string, choiceId: string): Promise<TurnResult> {
    const draft = this.sessions.get(sessionId);

    if (!draft || !draft.pending) {
      return {
        reply: "There's no question waiting on you.",
        draft,
        awaitingConfirmation: draft?.status === "awaiting_confirmation",
        question: null,
      };
    }

    const applied = await applyChoice(draft, choiceId);

    if (!applied.understood) {
      this.sessions.set(sessionId, draft);
      const note = applied.note ? `${applied.note} ` : "";
      return {
        reply: `${note}${draft.pending?.question ?? ""}`.trim(),
        draft,
        awaitingConfirmation: false,
        question: draft.pending?.question ?? null,
      };
    }

    const result = await advanceDraft(draft);
    this.sessions.set(sessionId, draft);
    if (applied.note) result.reply = `${applied.note}\n\n${result.reply}`;
    return result;
  }

  async handle(sessionId: string, message: string): Promise<TurnResult> {
    const existing = this.sessions.get(sessionId);

    // A completed draft is HELD. Typing another sentence here is far more likely
    // to be a slip than an instruction to throw away a sale that is one keystroke
    // from being saved, so the gate refuses to be walked past.
    if (existing && existing.status === "awaiting_confirmation") {
      return {
        reply: `That sale is still waiting on you.\n\n${formatSummary(existing)}\n\n${CONFIRM_PROMPT}`,
        draft: existing,
        awaitingConfirmation: true,
        question: null,
      };
    }

    // A message arriving while a question is outstanding is an answer to that
    // question, not a new sale.
    if (existing && existing.pending) {
      const applied = await applyAnswer(existing, message);

      if (!applied.understood) {
        // Re-ask rather than advance. The gap is still there, so guessing past
        // it would put an invented value on the summary.
        this.sessions.set(sessionId, existing);
        const note = applied.note ? `${applied.note} ` : "";
        return {
          reply: `${note}${existing.pending?.question ?? ""}`.trim(),
          draft: existing,
          awaitingConfirmation: false,
          question: existing.pending?.question ?? null,
        };
      }

      const result = await advanceDraft(existing);
      this.sessions.set(sessionId, existing);
      if (applied.note) result.reply = `${applied.note}\n\n${result.reply}`;
      return result;
    }

    const extracted = await extractSale(message);

    if (extracted.intent === "query") {
      // The read path runs entirely on tokens; see reporting/.
      const outcome = await answerQuery(message);
      return {
        reply: outcome.answer,
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

    const result = await advanceDraft(draft);
    this.sessions.set(sessionId, draft);
    return result;
  }
}
