import { grandTotal, lineTotal, type DraftSale } from "./draft.js";

/**
 * The itemised summary shown before anything is written (F8).
 *
 * Every figure here is computed from the draft, which holds only catalogue
 * prices. Nothing on this screen originated with the model. That matters
 * because this summary is the mitigation for R1 — it is the owner's chance to
 * catch a misparse before it becomes a business record, so it has to show the
 * quantities and prices actually about to be saved, not a restatement of them.
 */
export function formatSummary(draft: DraftSale): string {
  const lines: string[] = [];
  const who = draft.customerName ?? "unknown customer";

  lines.push(`Sale to ${who}`);
  lines.push("");

  for (const item of draft.items) {
    const name = item.productName ?? item.rawProduct;
    const quantity = item.quantity ?? 0;
    const unit = item.unit ?? "";
    const price = item.unitPrice ?? 0;
    const total = lineTotal(item) ?? 0;

    lines.push(
      `  ${name.padEnd(18)} ${String(quantity).padStart(5)} ${unit.padEnd(6)}` +
        ` x ${String(price).padStart(7)}  =  ${String(total).padStart(8)}`,
    );
  }

  const total = grandTotal(draft);
  lines.push(`  ${"".padEnd(18)} ${"".padStart(5)} ${"".padEnd(6)}   ${"".padStart(7)}     ${"-".repeat(8)}`);
  lines.push(
    `  ${"TOTAL".padEnd(18)} ${"".padStart(5)} ${"".padEnd(6)}   ${"".padStart(7)}  =  ${String(total ?? "incomplete").padStart(8)}`,
  );

  return lines.join("\n");
}
