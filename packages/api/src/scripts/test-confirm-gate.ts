/**
 * The confirmation gate and the write path.
 *
 * Success criterion 8 in two halves: a confirmed sale is written correctly, and
 * a rejected one writes nothing. Row-level verification needs psql — this
 * package has no database access by design.
 *
 * The deterministic half of this is covered without a live stack by
 * tests/unit/sale.service.test.ts; this script is the version that watches real
 * rows appear and not appear.
 */
import { cancelSale, confirmSale, handleMessage } from "../sales";
import { callServerTool, closeMcpClient, loadAgentTools } from "../mcp";
import { getDraft, resetSessions } from "../session";

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
  await callServerTool("find_or_create_customer", {
    name: "Ali",
    createIfMissing: true,
  });

  console.log("\nthe model is never told the write tool exists (R7)");
  const advertised = (await loadAgentTools()).map((t) => t.name);
  check("save_sale is not advertised", advertised.includes("save_sale") === false, advertised);

  console.log("\na completed sale waits at the gate");
  const built = await handleMessage("g1", "2kg rice and 2kg sugar to Ali");
  check("reaches the gate", built.awaitingConfirmation === true, built.reply);
  check("tells the owner how to proceed", built.reply.includes("/confirm"), built.reply);
  check("draft is held, not finished", getDraft("g1")?.status === "awaiting_confirmation");

  console.log("\ntyping another sale does NOT discard the held one");
  await sleep(PACING_MS);
  const interrupted = await handleMessage("g1", "3kg flour to Ali");
  check("still the same sale", interrupted.reply.includes("still waiting"), interrupted.reply);
  check("the original items are intact", interrupted.draft?.items.length === 2, interrupted.draft?.items.length);
  check("flour was not added", interrupted.reply.includes("Flour") === false);
  check("still at the gate", interrupted.awaitingConfirmation === true);

  console.log("\nrejection writes nothing (criterion 8)");
  const cancelled = cancelSale("g1");
  check("says nothing was saved", cancelled.reply.includes("Nothing was saved"), cancelled.reply);
  check("the draft is gone", getDraft("g1") === null);

  console.log("\nconfirming with nothing in progress is refused");
  const nothing = await confirmSale("g1");
  check("refuses politely", nothing.reply.includes("no sale to confirm"), nothing.reply);

  console.log("\nconfirming an unfinished sale is refused");
  resetSessions();
  await sleep(PACING_MS);
  const partial = await handleMessage("g2", "sold oil to Ali");
  check("it is still asking a question", partial.question !== null, partial);
  const early = await confirmSale("g2");
  check("the write is refused", early.reply.includes("isn't finished"), early.reply);
  check("and it re-states what it needs", early.question?.toLowerCase().includes("how much") === true, early.question);

  console.log("\nconfirming a complete sale writes it");
  resetSessions();
  await sleep(PACING_MS);
  const ready = await handleMessage("g3", "2kg rice and 2kg sugar to Ali");
  check("summary shows 800", ready.reply.includes("800"), ready.reply);

  const saved = await confirmSale("g3");
  check("reports success", saved.reply.startsWith("Saved."), saved.reply);
  check("returns a sale id", /Sale #\d+/.test(saved.reply), saved.reply);
  check("with the right total", saved.reply.includes("800"), saved.reply);
  check("names the customer", saved.reply.includes("Ali"), saved.reply);
  check("the draft is cleared", getDraft("g3") === null);
  check("no longer awaiting confirmation", saved.awaitingConfirmation === false);

  console.log("\nconfirming twice does not write twice");
  const again = await confirmSale("g3");
  check("the second confirm is refused", again.reply.includes("no sale to confirm"), again.reply);

  await closeMcpClient();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-confirm-gate FAILED:", error);
  await closeMcpClient();
  process.exit(1);
});
