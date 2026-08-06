import { escapeRegExp } from "./escape-reg-exp";
import type { PseudonymMap } from "./pseudonym.types";

/**
 * Replaces every known customer name in the text with its token.
 *
 * Longest names first: with "Ali" and "Ali Raza" both on file, replacing "Ali"
 * first would turn "Ali Raza" into "customer_1 Raza" and lose the distinction
 * between two different people.
 */
export function tokenise(text: string, map: PseudonymMap): string {
  const names = [...map.toToken.keys()].sort((a, b) => b.length - a.length);

  let result = text;
  for (const name of names) {
    const token = map.toToken.get(name) as string;
    result = result.replace(
      new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"),
      token,
    );
  }
  return result;
}
