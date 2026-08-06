import { Injectable } from "@nestjs/common";

import type { DraftSale } from "../draft";

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

  get(sessionId: string): DraftSale | null {
    this.sweep();
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.lastSeen = Date.now();
    return session.draft;
  }

  set(sessionId: string, draft: DraftSale | null): void {
    this.sessions.set(sessionId, { draft, lastSeen: Date.now() });
  }

  clear(sessionId: string): void {
    this.set(sessionId, null);
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
