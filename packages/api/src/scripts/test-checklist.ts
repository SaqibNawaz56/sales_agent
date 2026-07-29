/**
 * The per-item checklist and catalogue resolution.
 *
 * The checklist half runs with no I/O at all. The resolution half uses MCP and
 * the real database but never the model — drafts are constructed directly, so
 * these assertions cannot be knocked over by an extraction change or a Groq
 * rate limit.
 */
import { runChecklist } from "../checklist.js";
import { emptyDraft, newItem, type DraftSale } from "../draft.js";
import { closeMcpClient } from "../mcp.js";
import { resolveDraft } from "../resolve.js";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`, detail ? JSON.stringify(detail) : "");
    failures++;
  }
}

function draftWith(...items: ReturnType<typeof newItem>[]): DraftSale {
  const draft = emptyDraft("test");
  draft.items = items;
  return draft;
}

function resolvedItem(name: string, quantity: number | null) {
  const item = newItem(name, quantity, "kg");
  item.productId = 1;
  item.productName = name;
  item.unit = "kg";
  item.unitPrice = 300;
  return item;
}

async function main(): Promise<void> {
  console.log("\nchecklist - per-item gaps (no I/O)");

  const good = draftWith(resolvedItem("rice", 2));
  good.customerId = 7;
  good.customerName = "Ali";
  const goodResult = runChecklist(good);
  check("complete item has no gap", goodResult.items[0].gap === null);
  check("price counts as resolved", goodResult.items[0].priceResolved === true);
  check("draft is complete", goodResult.complete === true, goodResult);

  const noQty = draftWith(resolvedItem("oil", null));
  noQty.customerId = 7;
  noQty.customerName = "Ali";
  const noQtyResult = runChecklist(noQty);
  check("missing quantity is detected", noQtyResult.items[0].gap === "missing_quantity");
  check("draft is not complete", noQtyResult.complete === false);
  check(
    "the gap points at the right item",
    noQtyResult.firstGap?.kind === "missing_quantity" &&
      noQtyResult.firstGap.itemIndex === 0,
    noQtyResult.firstGap,
  );

  const unknown = draftWith(newItem("ghee", null, null));
  unknown.customerId = 7;
  unknown.customerName = "Ali";
  const unknownResult = runChecklist(unknown);
  check(
    "unknown product outranks missing quantity",
    unknownResult.items[0].gap === "unknown_product",
    unknownResult.items[0],
  );

  console.log("\nchecklist - gap ordering");
  const mixed = draftWith(resolvedItem("rice", 2), resolvedItem("sugar", null));
  const mixedResult = runChecklist(mixed);
  check(
    "asks about the incomplete item, not the first item",
    mixedResult.firstGap?.itemIndex === 1,
    mixedResult.firstGap,
  );

  const itemAndCustomer = draftWith(resolvedItem("oil", null));
  itemAndCustomer.customerName = "Ali";
  const bothResult = runChecklist(itemAndCustomer);
  check(
    "item gaps come before the customer gap",
    bothResult.firstGap?.kind === "missing_quantity",
    bothResult.firstGap,
  );

  console.log("\nchecklist - customer");
  const noCustomer = draftWith(resolvedItem("rice", 2));
  const noCustomerResult = runChecklist(noCustomer);
  check("unnamed customer is a gap", noCustomerResult.customerGap === "missing");
  check(
    "and it is what gets asked once items are fine",
    noCustomerResult.firstGap?.kind === "customer",
    noCustomerResult.firstGap,
  );

  const newCustomer = draftWith(resolvedItem("rice", 2));
  newCustomer.customerName = "Ali";
  check(
    "named but unresolved customer needs confirming",
    runChecklist(newCustomer).customerGap === "unconfirmed_new",
  );

  console.log("\nresolution - catalogue facts come from the database");
  const draft = emptyDraft("2kg rice and 2kg sugar to Ali");
  draft.customerName = "Ali";
  draft.items = [newItem("rice", 2, "kg"), newItem("sugar", 2, "kg")];
  await resolveDraft(draft);

  check("rice resolved", draft.items[0].productId !== null, draft.items[0]);
  check("rice price came from the catalogue", draft.items[0].unitPrice === 300);
  check("rice name is the catalogue's, not the owner's", draft.items[0].productName === "Rice");
  check("sugar price came from the catalogue", draft.items[1].unitPrice === 100);
  check("draft is now complete except the customer", runChecklist(draft).firstGap?.kind === "customer");

  console.log("\nresolution - unknown product keeps suggestions");
  const typo = emptyDraft("2kg suger");
  typo.items = [newItem("suger", 2, "kg")];
  await resolveDraft(typo);
  check("unresolved product has no price", typo.items[0].unitPrice === null);
  check(
    "near matches are recorded for the question",
    typo.items[0].suggestions.some((s) => s.name === "Sugar"),
    typo.items[0].suggestions,
  );
  check("checklist reports it as unknown", runChecklist(typo).items[0].gap === "unknown_product");

  console.log("\nresolution - never creates a customer as a side effect (R2)");
  const unknownCustomer = emptyDraft("2kg rice to Ali");
  unknownCustomer.customerName = "Ali";
  unknownCustomer.items = [newItem("rice", 2, "kg")];
  await resolveDraft(unknownCustomer);
  check("customer stays unresolved", unknownCustomer.customerId === null);
  check(
    "so the controller must confirm before creating",
    runChecklist(unknownCustomer).customerGap === "unconfirmed_new",
  );

  await closeMcpClient();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-checklist FAILED:", error);
  await closeMcpClient();
  process.exit(1);
});
