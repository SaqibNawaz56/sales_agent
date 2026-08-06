/**
 * The vocabulary of answer-button ids, in one place.
 *
 * Shared by the builders that issue choices and the handler that resolves
 * them, so the two cannot drift apart into a bug where a button exists but
 * nothing acts on it.
 */

/** Plain agreement — "add it", "add them". */
export const CHOICE_YES = "yes";

/** Plain refusal — "don't add", "leave it out". */
export const CHOICE_NO = "no";

/**
 * "None of those — add what I actually said."
 *
 * Distinct from CHOICE_YES because when the catalogue offered near matches,
 * agreement is ambiguous: "yes" to "did you mean saqib or Ali?" cannot say
 * which. This id means the suggestions were all wrong.
 */
export const CHOICE_NEW = "new";

const SUGGESTION_PREFIX = "suggestion:";

export function suggestionChoiceId(id: number): string {
  return `${SUGGESTION_PREFIX}${id}`;
}

/** The suggested record's id, or null when this is not a suggestion choice. */
export function parseSuggestionChoiceId(choiceId: string): number | null {
  if (!choiceId.startsWith(SUGGESTION_PREFIX)) return null;
  const parsed = Number(choiceId.slice(SUGGESTION_PREFIX.length));
  return Number.isInteger(parsed) ? parsed : null;
}
