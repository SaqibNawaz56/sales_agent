/**
 * The CLI.
 *
 * Day 3's stated proof surface, and the fallback demo path §3 relies on: it
 * keeps a demonstrable end-to-end system available regardless of how the React
 * UI progresses.
 *
 * It talks to the same controller the HTTP API will, so anything provable here
 * is provable in the browser later — the interface is a thin shell over
 * handleMessage, holding no business logic of its own.
 */
import { createInterface } from "node:readline";

import { cancelSale, confirmSale, handleMessage } from "./controller.js";
import { closeMcpClient } from "./mcp.js";
import { clearDraft, getDraft } from "./session.js";

const SESSION_ID = process.env.CLI_SESSION_ID ?? "cli";

const HELP = `
Commands
  /confirm  save the sale shown above
  /cancel   discard it without saving
  /new      abandon the sale in progress and start again
  /draft    show the raw draft state
  /help     this message
  /quit     exit

Anything else is treated as a message to the shop assistant.
Try:  2kg rice, 2kg sugar and oil to Ali
`;

function banner(): void {
  console.log("Sales agent — type what you sold, or /help for commands.");
  console.log("Sales are saved only after /confirm.\n");
}

async function respondTo(line: string): Promise<boolean> {
  const input = line.trim();
  if (input === "") return true;

  if (input === "/quit" || input === "/exit") return false;

  if (input === "/help") {
    console.log(HELP);
    return true;
  }

  if (input === "/new") {
    clearDraft(SESSION_ID);
    console.log("Started a new sale.\n");
    return true;
  }

  if (input === "/draft") {
    console.log(JSON.stringify(getDraft(SESSION_ID), null, 2));
    console.log("");
    return true;
  }

  // Confirmation is an explicit command, never a parsed "yes". If the model
  // classified the reply, the gate would be probabilistic again and a
  // misreading would write a sale the owner never approved — which is the
  // failure R7 exists to prevent. This is the CLI's equivalent of the React
  // confirm button being a deliberate physical action.
  if (input === "/confirm") {
    const result = await confirmSale(SESSION_ID);
    console.log(`\n${result.reply}\n`);
    return true;
  }

  if (input === "/cancel") {
    const result = cancelSale(SESSION_ID);
    console.log(`\n${result.reply}\n`);
    return true;
  }

  try {
    const result = await handleMessage(SESSION_ID, input);
    console.log(`\n${result.reply}\n`);
  } catch (error) {
    // A failed turn must not kill the session — the owner should be able to
    // retype rather than lose a half-built sale. Groq rate limits (R6) are the
    // most likely cause.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\nSomething went wrong: ${message}`);
    console.log("Your sale is still here — try again.\n");
  }

  return true;
}

async function main(): Promise<void> {
  banner();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Turns are processed strictly one at a time. Without pausing, piped input
  // would fire every line before the first await resolved, and the answers
  // would arrive before their questions.
  rl.setPrompt("> ");
  rl.prompt();

  for await (const line of rl) {
    rl.pause();
    const keepGoing = await respondTo(line);
    if (!keepGoing) break;
    rl.resume();
    rl.prompt();
  }

  rl.close();
  await closeMcpClient();
  console.log("Bye.");
}

main().catch(async (error) => {
  console.error("CLI failed:", error);
  await closeMcpClient();
  process.exit(1);
});
