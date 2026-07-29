/**
 * Draft state and session store.
 *
 * Runs with no model and no database — that is the point. The draft is the one
 * piece of the system that must never be probabilistic, so it is built to be
 * verifiable in isolation.
 */
import {
  emptyDraft,
  grandTotal,
  lineTotal,
  newItem,
  type DraftItem,
} from "../draft.js";
import {
  clearDraft,
  getDraft,
  resetSessions,
  sessionCount,
  setDraft,
} from "../session.js";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`, detail ? JSON.stringify(detail) : "");
    failures++;
  }
}

function resolved(quantity: number, unitPrice: number): DraftItem {
  const item = newItem("rice", quantity, "kg");
  item.productId = 1;
  item.productName = "Rice";
  item.unit = "kg";
  item.unitPrice = unitPrice;
  return item;
}

console.log("\ndraft construction");
const draft = emptyDraft("2kg rice and 2kg sugar to Ali");
check("starts with no items", draft.items.length === 0);
check("starts with no customer", draft.customerName === null);
check("starts with nothing pending", draft.pending === null);
check("keeps the original message", draft.originalMessage.includes("rice"));

console.log("\nline totals");
check("incomplete item has no line total", lineTotal(newItem("oil", null, null)) === null);
check("resolved item computes its line total", lineTotal(resolved(2, 300)) === 600);
check("decimal quantities are handled", lineTotal(resolved(0.5, 300)) === 150);
const noPrice = newItem("oil", 2, "litre");
check("quantity without price is still incomplete", lineTotal(noPrice) === null);

console.log("\ngrand total");
check("empty draft has no total", grandTotal(emptyDraft("x")) === null);

const complete = emptyDraft("x");
complete.items = [resolved(2, 300), resolved(2, 100)];
check("complete draft totals correctly", grandTotal(complete) === 800, {
  got: grandTotal(complete),
});

const partial = emptyDraft("x");
partial.items = [resolved(2, 300), newItem("oil", null, null)];
check(
  "one incomplete item blocks the whole total",
  grandTotal(partial) === null,
  { got: grandTotal(partial) },
);

console.log("\nsession store");
resetSessions();
check("unknown session has no draft", getDraft("nobody") === null);

setDraft("shop-1", draft);
check("stores and returns a draft", getDraft("shop-1")?.originalMessage === draft.originalMessage);

setDraft("shop-2", complete);
check("sessions are isolated", getDraft("shop-2")?.items.length === 2);
check("first session is unaffected", getDraft("shop-1")?.items.length === 0);

clearDraft("shop-1");
check("clearing removes the draft", getDraft("shop-1") === null);
check("but the session still exists", sessionCount() === 2);

resetSessions();
check("reset wipes everything", sessionCount() === 0);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
if (failures > 0) process.exit(1);
