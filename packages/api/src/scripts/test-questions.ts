/**
 * Question generation. No model, no database — templates over a known gap.
 */
import { runChecklist } from "../checklist.js";
import { emptyDraft, newItem, type DraftSale } from "../draft.js";
import { buildQuestion } from "../questions.js";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`, detail ? JSON.stringify(detail) : "");
    failures++;
  }
}

function ask(draft: DraftSale): string {
  const gap = runChecklist(draft).firstGap;
  if (!gap) return "";
  return buildQuestion(draft, gap).question;
}

function resolvedItem(raw: string, name: string, quantity: number | null) {
  const item = newItem(raw, quantity, null);
  item.productId = 1;
  item.productName = name;
  item.unit = "litre";
  item.unitPrice = 500;
  return item;
}

console.log("\nmissing quantity");
const noQty = emptyDraft("sold oil to Ali");
noQty.customerName = "Ali";
noQty.customerId = 7;
noQty.items = [resolvedItem("oil", "Cooking Oil", null)];
const qtyQuestion = ask(noQty);
check("asks about the amount", qtyQuestion.toLowerCase().startsWith("how much"), qtyQuestion);
check("uses the owner's word, not the catalogue's", qtyQuestion.includes("oil") && !qtyQuestion.includes("Cooking Oil"), qtyQuestion);
check("mentions the unit so the answer is unambiguous", qtyQuestion.includes("litre"), qtyQuestion);

console.log("\nunknown product");
const typo = emptyDraft("2kg suger to Ali");
typo.customerName = "Ali";
typo.customerId = 7;
const suger = newItem("suger", 2, "kg");
suger.suggestions = [{ id: 2, name: "Sugar" }];
typo.items = [suger];
const typoQuestion = ask(typo);
check("offers the near match (R2)", typoQuestion.includes("Sugar"), typoQuestion);
check("quotes what the owner actually typed", typoQuestion.includes("suger"), typoQuestion);

const brandNew = emptyDraft("1 ghee to Ali");
brandNew.customerName = "Ali";
brandNew.customerId = 7;
brandNew.items = [newItem("ghee", 1, null)];
const newQuestion = ask(brandNew);
check("with no near match, offers to add it (F5)", newQuestion.toLowerCase().includes("add it"), newQuestion);

console.log("\nmultiple suggestions read naturally");
const many = emptyDraft("x");
many.customerId = 7;
many.customerName = "Ali";
const ambiguous = newItem("powder", 1, null);
ambiguous.suggestions = [
  { id: 1, name: "Washing Powder" },
  { id: 2, name: "Red Chilli Powder" },
];
many.items = [ambiguous];
check("joins options with 'or'", ask(many).includes("Washing Powder or Red Chilli Powder"), ask(many));

console.log("\ncustomer");
const noCustomer = emptyDraft("2kg rice");
noCustomer.items = [resolvedItem("rice", "Rice", 2)];
check("unnamed customer is asked plainly", ask(noCustomer) === "Who was this sale for?", ask(noCustomer));

const newCustomer = emptyDraft("2kg rice to Ali");
newCustomer.customerName = "Ali";
newCustomer.items = [resolvedItem("rice", "Rice", 2)];
check("new customer asks before creating (R2)", ask(newCustomer).includes("new customer"), ask(newCustomer));

const similarCustomer = emptyDraft("2kg rice to Alee");
similarCustomer.customerName = "Alee";
similarCustomer.customerSuggestions = [{ id: 3, name: "Ali" }];
similarCustomer.items = [resolvedItem("rice", "Rice", 2)];
check("near-match customer is offered, not created", ask(similarCustomer).includes("Did you mean Ali"), ask(similarCustomer));

console.log("\nnothing to ask when the draft is complete");
const done = emptyDraft("2kg rice to Ali");
done.customerName = "Ali";
done.customerId = 7;
done.items = [resolvedItem("rice", "Rice", 2)];
check("no gap means no question", ask(done) === "");

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
if (failures > 0) process.exit(1);
