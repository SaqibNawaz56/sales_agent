/**
 * The CLI.
 *
 * Day 3's stated proof surface, and the fallback demo path §3 relies on: it
 * keeps a demonstrable end-to-end system available regardless of how the React
 * UI progresses.
 */
import { createInterface } from "node:readline";

import { closeMcpClient } from "../mcp";
import { banner } from "./banner";
import { handleLine } from "./handle-line";

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
    const keepGoing = await handleLine(line);
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
