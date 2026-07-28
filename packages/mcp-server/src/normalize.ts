/**
 * The single normalisation rule for product and customer names.
 *
 * Every write and every lookup must go through this function. If seeded rows
 * were normalised one way and runtime lookups another, catalogue entries would
 * silently become unfindable and it would present as a fuzzy-matching bug
 * rather than a mismatch. One definition, imported everywhere — including by
 * prisma/seed.ts.
 */
export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
