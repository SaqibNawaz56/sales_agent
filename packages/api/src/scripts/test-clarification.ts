/**
 * The clarification loop: parsing a reply, and applying it to exactly one gap.
 *
 * The central assertion is the F4 one — after answering "how much oil?", every
 * other item in the draft must be byte-for-byte what it was before.
 */
import { parseQuantityAnswer } from "../llm";
import { applyAnswer } from "../clarification";
import { runChecklist } from "../checklist";
import { emptyDraft, newItem, type DraftSale } from "../draft";
import { closeMcpClient } from "../mcp";
import { buildQuestion } from "../questions";

const PACING_MS = 4_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`, detail ? JSON.stringify(detail) : "");
    failures++;
  }
}

function resolvedItem(raw: string, name: string, quantity: number | null, price: number) {
  const item = newItem(raw, quantity, null);
  item.productId = Math.floor(Math.random() * 1000) + 1;
  item.productName = name;
  item.unit = "litre";
  item.unitPrice = price;
  return item;
}

/** A three-item draft with exactly one gap: the oil has no quantity. */
function threeItemDraft(): DraftSale {
  const draft = emptyDraft("2kg rice, 2kg sugar and oil to Ali");
  draft.customerName = "Ali";
  draft.customerId = 7;
  draft.items = [
    resolvedItem("rice", "Rice", 2, 300),
    resolvedItem("sugar", "Sugar", 2, 100),
    resolvedItem("oil", "Cooking Oil", null, 500),
  ];
  return draft;
}

async function main(): Promise<void> {
  console.log("\nquantity answers are parsed narrowly");
  const cases: Array<[string, number | null, string | null]> = [
    ["2 litres", 2, "litre"],
    ["two", 2, null],
    ["half kg", 0.5, "kg"],
    ["1 dozen", 1, "dozen"],
    ["hello there", null, null],
  ];

  let first = true;
  for (const [reply, expectedQty, expectedUnit] of cases) {
    if (!first) await sleep(PACING_MS);
    first = false;

    const answer = await parseQuantityAnswer("How much oil (in litre)?", reply);
    const qtyOk = answer.quantity === expectedQty;
    const unitOk =
      expectedUnit === null ||
      (answer.unit ?? "").toLowerCase().startsWith(expectedUnit);
    check(`"${reply}" -> ${expectedQty}${expectedUnit ? ` ${expectedUnit}` : ""}`, qtyOk && unitOk, answer);
  }

  console.log("\nthe answer updates only the item that was asked about (F4)");
  const draft = threeItemDraft();
  const gap = runChecklist(draft).firstGap!;
  draft.pending = buildQuestion(draft, gap);
  check("the question targets the oil", draft.pending.itemIndex === 2, draft.pending);

  const before = JSON.stringify(draft.items.slice(0, 2));

  await sleep(PACING_MS);
  const applied = await applyAnswer(draft, "2 litres");
  check("the reply was understood", applied.understood === true, applied);
  check("oil now has its quantity", draft.items[2].quantity === 2, draft.items[2]);
  check("rice and sugar are untouched", JSON.stringify(draft.items.slice(0, 2)) === before);
  check("the sale was not restarted", draft.items.length === 3);
  check("nothing is pending any more", draft.pending === null);
  check("the draft is now complete", runChecklist(draft).complete === true, runChecklist(draft));

  console.log("\nan unusable reply leaves the question standing");
  const stuck = threeItemDraft();
  stuck.pending = buildQuestion(stuck, runChecklist(stuck).firstGap!);
  await sleep(PACING_MS);
  const confused = await applyAnswer(stuck, "no idea");
  check("reports it did not understand", confused.understood === false, confused);
  check("quantity was not invented (R1)", stuck.items[2].quantity === null, stuck.items[2]);
  check("the question is still pending", stuck.pending !== null);

  console.log("\ncustomer confirmation adopts a suggestion without creating");
  const customer = emptyDraft("2kg rice to Alee");
  customer.customerName = "Alee";
  customer.customerSuggestions = [{ id: 42, name: "Ali" }];
  customer.items = [resolvedItem("rice", "Rice", 2, 300)];
  customer.pending = buildQuestion(customer, runChecklist(customer).firstGap!);
  check("asks whether he meant Ali", customer.pending.question.includes("Ali"), customer.pending);

  await sleep(PACING_MS);
  const chose = await applyAnswer(customer, "yes");
  check("the suggestion was adopted", chose.understood === true && customer.customerId === 42, {
    chose,
    id: customer.customerId,
  });
  check("the name was corrected too", customer.customerName === "Ali");

  await closeMcpClient();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-clarification FAILED:", error);
  await closeMcpClient();
  process.exit(1);
});
