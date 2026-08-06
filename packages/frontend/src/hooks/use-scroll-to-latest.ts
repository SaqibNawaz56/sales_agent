import { useEffect, useRef, type RefObject } from "react";

export interface ScrollAnchors {
  /** Sits after the last message; scrolled to during normal conversation. */
  endRef: RefObject<HTMLDivElement | null>;
  /** Attached to the confirmation card, so its top can be brought into view. */
  cardRef: RefObject<HTMLDivElement | null>;
}

/**
 * Keeps the right thing in view as the transcript grows.
 *
 * When the gate appears, this brings the TOP of the card into view rather than
 * the bottom of the transcript. Scrolling to the end puts a tall card's header
 * — the customer name and the first items — above the fold, so the owner would
 * be asked to approve a sale he can only partly see.
 */
export function useScrollToLatest(
  awaiting: boolean,
  changes: readonly unknown[],
): ScrollAnchors {
  const endRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (awaiting && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    // The caller passes a fixed-length list of the values that should retrigger
    // the scroll; spreading it keeps that decision at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, ...changes]);

  return { endRef, cardRef };
}
