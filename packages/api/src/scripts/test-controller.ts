/**
 * The controller turn loop.
 *
 * Day 3's "done when": a message with a missing quantity triggers EXACTLY one
 * targeted question and then completes. "Exactly" is the load-bearing word —
 * a loop that asks twice would satisfy a lazier assertion while failing the
 * actual criterion, so the questions are counted.
 */
import { handleMessage } from "../controller.js";
import { callServerTool, closeMcpClient } from "../mcp.js";
import { resetSessions } from "../session.js";

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

async function main(): Promise<void> {
  resetSessions();

  // Ali must already exist, so the only gap in the test below is the quantity.
  // Otherwise the customer would be a second, legitimate question.
  await callServerTool("find_or_create_customer", {
    name: "Ali",
    createIfMissing: true,
  });

  console.log("\ncomplete sentence needs no questions at all");
  const complete = await handleMessage("s1", "2kg rice and 2kg sugar to Ali");
  check("no question asked", complete.question === null, complete.question);
  check("summary is presented", complete.awaitingConfirmation === true, complete);
  check("total is correct", complete.reply.includes("800"), complete.reply);
  check("both items are on the summary", complete.reply.includes("Rice") && complete.reply.includes("Sugar"));

  console.log("\nDay 3 'done when' - one missing quantity, one question");
  resetSessions();
  let questionsAsked = 0;

  await sleep(PACING_MS);
  const turn1 = await handleMessage("s2", "2kg rice, 2kg sugar and oil to Ali");
  if (turn1.question) questionsAsked++;
  check("asks about the missing quantity", turn1.question?.toLowerCase().includes("how much oil") === true, turn1.question);
  check("does not present a summary yet", turn1.awaitingConfirmation === false);
  check("the rest of the sale was kept", turn1.draft?.items.length === 3, turn1.draft?.items.length);

  await sleep(PACING_MS);
  const turn2 = await handleMessage("s2", "2 litres");
  if (turn2.question) questionsAsked++;
  check("EXACTLY one question was asked", questionsAsked === 1, { questionsAsked });
  check("the sale completes", turn2.awaitingConfirmation === true, turn2);
  check("rice survived the clarification", turn2.reply.includes("Rice"));
  check("sugar survived the clarification", turn2.reply.includes("Sugar"));
  check("oil is now priced", turn2.reply.includes("Oil"));
  check("total includes all three lines", turn2.reply.includes("1800"), turn2.reply);

  console.log("\nan unusable answer re-asks instead of guessing");
  resetSessions();
  await sleep(PACING_MS);
  await handleMessage("s3", "sold oil to Ali");
  await sleep(PACING_MS);
  const confused = await handleMessage("s3", "no idea");
  check("still asking the same thing", confused.question?.toLowerCase().includes("how much oil") === true, confused.question);
  check("no summary was produced", confused.awaitingConfirmation === false);
  check("no quantity was invented (R1)", confused.draft?.items[0].quantity === null);

  console.log("\nnon-sale messages are handled without a draft");
  resetSessions();
  await sleep(PACING_MS);
  const query = await handleMessage("s4", "what did I sell today?");
  check("query is recognised, not parsed as a sale", query.draft === null, query);
  check("and it says so plainly", query.reply.toLowerCase().includes("can't answer questions"), query.reply);

  console.log("\nsessions do not leak into each other");
  resetSessions();
  await sleep(PACING_MS);
  await handleMessage("shop-a", "2kg rice to Ali");
  await sleep(PACING_MS);
  const other = await handleMessage("shop-b", "sold oil to Ali");
  check("second session has its own draft", other.draft?.items.length === 1, other.draft?.items.length);
  check("and its own pending question", other.question?.toLowerCase().includes("oil") === true);

  // Leave the database as we found it.
  await closeMcpClient();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-controller FAILED:", error);
  await closeMcpClient();
  process.exit(1);
});
