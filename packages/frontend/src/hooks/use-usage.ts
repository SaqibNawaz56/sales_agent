import { useEffect, useState } from "react";

import { fetchUsage, type Usage } from "../api/fetch-usage";

/** Frequent enough to feel live during a demo, cheap enough to ignore. */
const POLL_MS = 4000;

/**
 * Polls the server's view of the Groq quota.
 *
 * Polling rather than piggybacking on chat responses, because the interesting
 * moment is often when nothing is happening: the owner wants to see the
 * allowance refill after a burst of sales, and a number that only moves when he
 * sends a message cannot show that.
 *
 * Paused while the tab is hidden. A background tab burning requests to draw a
 * meter nobody is looking at would be a strange thing for a rate-limit warning
 * to do.
 */
export function useUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    async function tick() {
      if (document.visibilityState === "visible") {
        try {
          const next = await fetchUsage(controller.signal);
          if (!cancelled) setUsage(next);
        } catch {
          // A failed poll is not worth showing. The meter keeps the last
          // reading, which is more useful than an error where a number was.
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    }

    void tick();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return usage;
}
