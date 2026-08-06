import type { DraftSale } from "../draft";
import { sessionStore } from "./session.store";

/**
 * Function facade over the shared store, for entrypoints without a container.
 *
 * cli.ts and the verification scripts call these. They are a thin binding to
 * `sessionStore`, not a second implementation — a draft written through
 * setDraft is visible to the HTTP API and vice versa.
 */

export function getDraft(sessionId: string): DraftSale | null {
  return sessionStore.get(sessionId);
}

export function setDraft(sessionId: string, draft: DraftSale | null): void {
  sessionStore.set(sessionId, draft);
}

export function clearDraft(sessionId: string): void {
  sessionStore.clear(sessionId);
}

export function sessionCount(): number {
  return sessionStore.count();
}

export function resetSessions(): void {
  sessionStore.reset();
}
