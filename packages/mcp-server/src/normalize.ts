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

/**
 * The catalogue's display name for something the owner typed.
 *
 * Seeded products are title-cased ("Rice", "Washing Powder"), but a product
 * added mid-sale arrives as whatever the owner typed — "ghee". Without this,
 * the catalogue's casing drifts by however each product happened to be entered,
 * and a summary reads "Rice, Sugar, ghee". Matching is unaffected either way,
 * since that runs on the normalised form.
 */
export function toDisplayName(value: string): string {
  return normalize(value)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
