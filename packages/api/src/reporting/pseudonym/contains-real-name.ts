import { escapeRegExp } from "./escape-reg-exp";
import type { PseudonymMap } from "./pseudonym.types";

/**
 * True if the text still contains any real customer name.
 *
 * Not used by the request path — this exists so success criterion 15 can be
 * asserted directly against the exact string that was sent to Groq, rather than
 * inferred from the absence of a complaint.
 */
export function containsRealName(text: string, map: PseudonymMap): boolean {
  for (const name of map.toToken.keys()) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text)) return true;
  }
  return false;
}
