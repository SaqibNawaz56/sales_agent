import { escapeRegExp } from "./escape-reg-exp";
import type { PseudonymMap } from "./pseudonym.types";

/** Maps tokens back to real names, locally, after the model has responded. */
export function detokenise(text: string, map: PseudonymMap): string {
  let result = text;
  for (const [token, name] of map.toReal) {
    result = result.replace(
      new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi"),
      name,
    );
  }
  return result;
}
