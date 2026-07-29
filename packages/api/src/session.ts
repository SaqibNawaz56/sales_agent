import type { DraftSale } from "./draft.js";

/**
 * Server-side session store.
 *
 * In-memory on purpose: this is a single-operator shop with no auth and no
 * multi-tenancy, so there is nothing to coordinate across processes. The
 * trade-off is that a container restart discards any sale still being
 * assembled. That is acceptable — an unconfirmed draft is not yet a business
 * record, and nothing is lost that the owner cannot retype — but it should be
 * stated rather than discovered during a demo.
 *
 * The stored draft is the only place a sale-in-progress exists. It is never
 * handed to the model.
 */
interface Session {
  draft: DraftSale | null;
  lastSeen: number;
}

const sessions = new Map<string, Session>();

/**
 * Drafts older than this are discarded. A shopkeeper who walked away mid-sale
 * an hour ago is not coming back to finish that sentence, and a stale draft
 * that silently resumes is worse than one that quietly expires.
 */
const TTL_MS = 60 * 60 * 1000;

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, session] of sessions) {
    if (session.lastSeen < cutoff) sessions.delete(id);
  }
}

export function getDraft(sessionId: string): DraftSale | null {
  sweep();
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.lastSeen = Date.now();
  return session.draft;
}

export function setDraft(sessionId: string, draft: DraftSale | null): void {
  sessions.set(sessionId, { draft, lastSeen: Date.now() });
}

export function clearDraft(sessionId: string): void {
  setDraft(sessionId, null);
}

/** Test and diagnostic helper. Not part of the request path. */
export function sessionCount(): number {
  sweep();
  return sessions.size;
}

/** Test helper: wipes everything without waiting for the TTL. */
export function resetSessions(): void {
  sessions.clear();
}
