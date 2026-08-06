import { useState } from "react";

const STORAGE_KEY = "sales-agent-session";

/**
 * The session id is generated once and kept in localStorage, so a refresh does
 * not abandon a sale being assembled. The draft itself lives on the server —
 * this is only the key to it.
 */
export function useSessionId(): string {
  const [sessionId] = useState(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = `shop-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  });
  return sessionId;
}
