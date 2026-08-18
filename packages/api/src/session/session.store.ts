import { Injectable } from "@nestjs/common";

import type { DraftSale } from "../draft";
import type { PendingPriceChange } from "../pricing";

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
 *
 * A class rather than a module of closures, as of the Nest port. The Map used
 * to be a singleton by accident of Node's module cache; as a provider it is a
 * singleton by construction, and a test can swap it via `overrideProvider`
 * instead of reaching for a reset helper.
 */
interface Session {
  draft: DraftSale | null;
  /**
   * A price change shown and not yet accepted.
   *
   * Its own slot rather than a field on the draft, because a price change is
   * not part of a sale — the owner can reprice rice while a sale is half
   * assembled, and folding the two together would make cancelling one discard
   * the other.
   */
  priceChange: PendingPriceChange | null;
  lastSeen: number;
}

/**
 * Drafts older than this are discarded. A shopkeeper who walked away mid-sale
 * an hour ago is not coming back to finish that sentence, and a stale draft
 * that silently resumes is worse than one that quietly expires.
 */
const TTL_MS = 60 * 60 * 1000;

@Injectable()
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  private sweep(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, session] of this.sessions) {
      if (session.lastSeen < cutoff) this.sessions.delete(id);
    }
  }

  /** Touches lastSeen and returns the row, creating one if needed. */
  private touch(sessionId: string): Session {
    this.sweep();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastSeen = Date.now();
      return existing;
    }
    const created: Session = {
      draft: null,
      priceChange: null,
      lastSeen: Date.now(),
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  get(sessionId: string): DraftSale | null {
    this.sweep();
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.lastSeen = Date.now();
    return session.draft;
  }

  /** Writes the draft, leaving any pending price change alone. */
  set(sessionId: string, draft: DraftSale | null): void {
    this.touch(sessionId).draft = draft;
  }

  clear(sessionId: string): void {
    this.set(sessionId, null);
  }

  getPriceChange(sessionId: string): PendingPriceChange | null {
    this.sweep();
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.lastSeen = Date.now();
    return session.priceChange;
  }

  /** Writes the pending price change, leaving any draft sale alone. */
  setPriceChange(sessionId: string, change: PendingPriceChange | null): void {
    this.touch(sessionId).priceChange = change;
  }

  /** Test and diagnostic helper. Not part of the request path. */
  count(): number {
    this.sweep();
    return this.sessions.size;
  }

  /** Test helper: wipes everything without waiting for the TTL. */
  reset(): void {
    this.sessions.clear();
  }
}

/**
 * The one instance the whole process shares.
 *
 * Exported so the CLI and the day-by-day verification scripts — plain Node
 * entrypoints with no Nest container — keep working. AppModule provides this
 * exact object rather than letting Nest construct its own, so there is one
 * store, not one per entrypoint.
 */
export const sessionStore = new SessionStore();
