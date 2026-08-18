/**
 * Does the rewritten sentence contain exactly the figures the original did?
 *
 * THIS IS THE WHOLE SAFETY ARGUMENT for letting a model touch an answer.
 *
 * Every figure in this system is formatted by application code precisely so a
 * model cannot garble it — that is why the read path assembles its sentences
 * from tool results rather than asking a model to phrase them. Handing a
 * finished sentence to a summariser reopens that door: a model asked to rewrite
 * "2 sales totalling 4350" can plausibly return 4,350 or 43500 or 435, and the
 * owner has no way to know which.
 *
 * So the rewrite is checked rather than trusted. The multiset of numbers must
 * match exactly — same values, same count. A rewrite that adds, drops or alters
 * a figure is discarded and the original sentence is shown instead.
 *
 * Separators are stripped before comparing, so "4,350" and "4350" are the same
 * figure written two ways — that is formatting, which the narrator is allowed to
 * change. Inventing 43500 is not.
 */
export function sameFigures(original: string, rewritten: string): boolean {
  const a = figuresIn(original);
  const b = figuresIn(rewritten);

  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

/**
 * Every number in the text, sorted, with thousands separators removed.
 *
 * Sorted rather than in order of appearance: a translation into Urdu or any
 * other language may legitimately reorder a sentence, and only the set of
 * figures needs to survive that, not their position.
 */
function figuresIn(text: string): number[] {
  // Commas and spaces inside a run of digits are separators; a full stop is a
  // decimal point and is kept.
  const normalised = text.replace(/(\d)[,\s](?=\d{3}\b)/g, "$1");
  const matches = normalised.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map(Number).sort((x, y) => x - y);
}
