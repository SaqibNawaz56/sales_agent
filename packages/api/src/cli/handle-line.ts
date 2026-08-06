import { cancelSale, confirmSale, handleMessage } from "../sales";
import { clearDraft, getDraft } from "../session";
import { HELP } from "./help-text";
import { SESSION_ID } from "./session-id";

/**
 * Handles one line of input. Returns false when the session should end.
 *
 * The CLI holds no business logic of its own — it is a shell over the same
 * SaleService the HTTP API uses, so anything provable here is provable in the
 * browser.
 */
export async function handleLine(line: string): Promise<boolean> {
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
