/**
 * Near-match support for risk R2 (typos creating duplicate rows).
 *
 * The catalogue is 50-200 rows, so a full scan per lookup is cheaper than a
 * trigram index and avoids requiring a Postgres extension. If the catalogue
 * ever grows past a few thousand rows, replace this with pg_trgm rather than
 * optimising it.
 */

/** Standard Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const substitution = previous[j] + (a[i] === b[j] ? 0 : 1);
      const insertion = current[j] + 1;
      const deletion = previous[j + 1] + 1;
      current.push(Math.min(substitution, insertion, deletion));
    }
    previous = current;
  }

  return previous[b.length];
}

export interface Candidate {
  normalizedName: string;
  [key: string]: unknown;
}

/**
 * Ranks candidates by closeness to the query.
 *
 * Tolerance scales with word length: "oil" should not match "salt" on two
 * edits, but "washing powdr" should still reach "washing powder". A substring
 * hit always qualifies, which covers the common case of the owner typing a
 * partial name.
 */
export function findNearMatches<T extends Candidate>(
  normalizedQuery: string,
  candidates: T[],
  limit = 3,
): T[] {
  const tolerance = Math.max(1, Math.floor(normalizedQuery.length / 4));

  return candidates
    .map((candidate) => ({
      candidate,
      distance: levenshtein(normalizedQuery, candidate.normalizedName),
      substring:
        candidate.normalizedName.includes(normalizedQuery) ||
        normalizedQuery.includes(candidate.normalizedName),
    }))
    .filter((scored) => scored.substring || scored.distance <= tolerance)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map((scored) => scored.candidate);
}
