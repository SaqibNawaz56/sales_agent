import { useCallback, useRef, useState } from "react";

import {
  answerQuestion,
  resolveSale,
  sendMessage,
  type ChatResponse,
  type DraftSale,
  type PendingQuestion,
  type ReceiptRef,
} from "../api";
import { GREETING, SALE_READY } from "../constants/copy";
import type { Message } from "../types/message";

export interface Conversation {
  messages: Message[];
  draft: DraftSale | null;
  question: PendingQuestion | null;
  awaiting: boolean;
  busy: boolean;
  error: string | null;
  /**
   * The receipt currently on offer: the sale just saved, or the single past
   * sale an answer just described. Cleared by the next turn either way.
   */
  receipt: ReceiptRef | null;
  send: (text: string) => Promise<void>;
  choose: (choiceId: string) => Promise<void>;
  resolve: (confirmed: boolean) => Promise<void>;
}

/**
 * All conversation state and the three things that can change it.
 *
 * Extracted from App so the component tree is composition only. The important
 * property preserved here is that `resolve` is the sole path to writing a sale
 * and it takes `confirmed` as a required argument — there is no code path in
 * this client that reaches the confirm endpoint without an explicit true or
 * false originating from a button press.
 *
 * `choose` is the same idea one level down: adding a customer or a product are
 * also writes, and they are also reached only by pressing one of the options
 * the server offered.
 */
export function useConversation(sessionId: string): Conversation {
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: "agent", text: GREETING },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSale | null>(null);
  const [question, setQuestion] = useState<PendingQuestion | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptRef | null>(null);

  const nextId = useRef(1);

  const append = useCallback((from: Message["from"], text: string): void => {
    setMessages((current) => [...current, { id: nextId.current++, from, text }]);
  }, []);

  const absorb = useCallback(
    (response: ChatResponse, replyText?: string): void => {
      append("agent", replyText ?? response.reply);
      setDraft(response.draftSale);
      setQuestion(response.question);
      setAwaiting(response.awaitingConfirmation);
    },
    [append],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      if (text === "" || busy) return;

      append("owner", text);
      setBusy(true);
      setError(null);
      // The previous sale's receipt belongs to the previous sale. Leaving it up
      // while a new one is being assembled invites downloading the wrong one.
      setReceipt(null);

      try {
        const response = await sendMessage(sessionId, text);
        absorb(
          response,
          response.awaitingConfirmation ? SALE_READY : response.reply,
        );
        // Set when the answer was about one past sale — "what did Ali buy last
        // time" — so the receipt for it is offered beside the answer. Null for
        // anything else, so it does not survive into the next turn.
        setReceipt(response.receipt ?? null);
      } catch (failure) {
        // The draft survives on the server, so the owner retries one line rather
        // than losing a half-built sale (R6).
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setBusy(false);
      }
    },
    [absorb, append, busy, sessionId],
  );

  const choose = useCallback(
    async (choiceId: string): Promise<void> => {
      if (busy) return;

      // Echo the pressed label into the transcript, so the record of the
      // conversation reads the same whether the owner typed or clicked.
      const pressed = question?.choices.find((c) => c.id === choiceId);
      if (pressed) append("owner", pressed.label);

      // Cleared immediately: the buttons have been used and must not be
      // pressable a second time while the request is in flight.
      setQuestion(null);
      setBusy(true);
      setError(null);

      try {
        const response = await answerQuestion(sessionId, choiceId);
        absorb(
          response,
          response.awaitingConfirmation ? SALE_READY : response.reply,
        );
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setBusy(false);
      }
    },
    [absorb, append, busy, question, sessionId],
  );

  const resolve = useCallback(
    async (confirmed: boolean): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);

      try {
        const response = await resolveSale(sessionId, confirmed);
        absorb(response);
        // Null on a cancellation, which is what clears a previous sale's link.
        setReceipt(response.receipt ?? null);
      } catch (failure) {
        // The card stays on screen so the owner can try again — a failed save
        // must not look like a completed one.
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setBusy(false);
      }
    },
    [absorb, busy, sessionId],
  );

  return {
    messages,
    draft,
    question,
    awaiting,
    busy,
    error,
    receipt,
    send,
    choose,
    resolve,
  };
}
