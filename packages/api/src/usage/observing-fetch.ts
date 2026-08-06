import { recordHeaders } from "./rate-limit-store";
import type { UsageBucket } from "./usage.types";

/**
 * A fetch that reads the rate-limit headers on the way past.
 *
 * ChatGroq accepts a custom `fetch`, which is the only seam through which those
 * headers are reachable: LangChain's response_metadata carries token counts but
 * discards the headers entirely, so without this the remaining quota would have
 * to be inferred rather than read.
 *
 * Deliberately transparent — it returns the untouched response and swallows its
 * own errors. Observability must never be able to fail a sale.
 */
export function observingFetch(bucket: UsageBucket): typeof fetch {
  return async (...args: Parameters<typeof fetch>) => {
    const response = await fetch(...args);
    try {
      recordHeaders(bucket, response.headers);
    } catch {
      // Ignored on purpose; see above.
    }
    return response;
  };
}
