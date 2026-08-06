/**
 * The new-product sub-loop (F5).
 *
 * The sale pauses on an unknown product, the owner is asked for a price, the
 * product is written to the catalogue, and the SAME sale resumes with
 * everything else intact.
 *
 * Requires "ghee" and "masala" to be absent from the catalogue. verify-day4.ps1
 * clears them first; run those deletes yourself if invoking this directly.
 */
import { handleMessage } from "../sales";
import { callServerTool, closeMcpClient } from "../mcp";
import { resetSessions } from "../session";

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

interface LookupResult {
  found: boolean;
  product?: { id: number; name: string; unit: string; currentPrice: number };
}

async function main(): Promise<void> {
  resetSessions();
  await callServerTool("find_or_create_customer", {
    name: "Ali",
    createIfMissing: true,
  });

  console.log("\nunknown product pauses the sale, keeping the rest");
  const turn1 = await handleMessage("np1", "2kg rice and 1kg ghee to Ali");
  check("offers to add it", turn1.question?.toLowerCase().includes("add it") === true, turn1.question);
  check("quotes the owner's word", turn1.question?.includes("ghee") === true);
  check("rice is still in the draft", turn1.draft?.items.length === 2, turn1.draft?.items.length);
  check("no summary yet", turn1.awaitingConfirmation === false);

  await sleep(PACING_MS);
  const turn2 = await handleMessage("np1", "yes");
  check("asks for the price", turn2.question?.toLowerCase().includes("price") === true, turn2.question);
  check("knows the unit from the sentence", turn2.question?.includes("per kg") === true, turn2.question);

  await sleep(PACING_MS);
  const turn3 = await handleMessage("np1", "1200");
  check("the sale resumes and completes", turn3.awaitingConfirmation === true, turn3.reply);
  check("it confirms what was added", turn3.reply.includes("Added Ghee"), turn3.reply);
  check("rice survived the sub-loop", turn3.reply.includes("Rice"), turn3.reply);
  check("ghee is priced at what the owner said", turn3.reply.includes("1200"), turn3.reply);
  check("total is 600 + 1200 = 1800", turn3.reply.includes("1800"), turn3.reply);

  console.log("\nthe product really is in the catalogue now");
  const lookup = await callServerTool<LookupResult>("lookup_product", { name: "ghee" });
  check("lookup_product finds it", lookup.found === true, lookup);
  check("at the owner's price", lookup.product?.currentPrice === 1200, lookup.product);
  check("with the unit from the sentence", lookup.product?.unit === "kg", lookup.product);

  console.log("\nno unit in the sentence - asks for it without losing the price");
  resetSessions();
  await sleep(PACING_MS);
  const m1 = await handleMessage("np2", "1 masala to Ali");
  check("offers to add masala", m1.question?.toLowerCase().includes("add it") === true, m1.question);

  await sleep(PACING_MS);
  const m2 = await handleMessage("np2", "yes");
  check("asks for price and unit together", m2.question?.toLowerCase().includes("what unit") === true, m2.question);

  await sleep(PACING_MS);
  const m3 = await handleMessage("np2", "450");
  check("keeps the price and asks only for the unit", m3.question?.includes("450") === true, m3.question);
  check("still not complete", m3.awaitingConfirmation === false);

  await sleep(PACING_MS);
  const m4 = await handleMessage("np2", "packet");
  check("completes once the unit arrives", m4.awaitingConfirmation === true, m4.reply);
  check("the price given earlier was not lost", m4.reply.includes("450"), m4.reply);

  console.log("\ndeclining to add it drops the item instead of stalling");
  resetSessions();
  await sleep(PACING_MS);
  await handleMessage("np3", "2kg rice and 1kg saffron to Ali");
  await sleep(PACING_MS);
  const declined = await handleMessage("np3", "no");
  check("the sale still completes", declined.awaitingConfirmation === true, declined.reply);
  check("without the declined item", declined.reply.includes("Saffron") === false, declined.reply);
  check("rice is still there", declined.reply.includes("Rice"), declined.reply);

  await closeMcpClient();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-new-product FAILED:", error);
  await closeMcpClient();
  process.exit(1);
});
