/**
 * Exercises find_or_create_customer over MCP, with emphasis on risk R2: a
 * duplicate customer row silently fragments that customer's whole history, so
 * creation must never happen by accident.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { prisma } from "../db.js";
import { normalize } from "../normalize.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp");

const FIXTURES = ["Ali", "Ali Raza"];

async function clearFixtures(): Promise<void> {
  await prisma.customer.deleteMany({
    where: { normalizedName: { in: FIXTURES.map(normalize) } },
  });
}

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
  await clearFixtures();

  const client = new Client({ name: "customer-tool-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(url));

  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    const content = response.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0].text);
  };

  const before = await prisma.customer.count();

  console.log("\nunknown customer, no create flag - must NOT create (R2)");
  const missing = await call("find_or_create_customer", { name: "Ali" });
  check("reports not found", missing.found === false, missing);
  check("did not create", missing.created === false, missing);
  check(
    "no row was written",
    (await prisma.customer.count()) === before,
    { before, after: await prisma.customer.count() },
  );

  console.log("\nexplicit create");
  const created = await call("find_or_create_customer", {
    name: "Ali",
    createIfMissing: true,
  });
  check("creates when asked", created.created === true, created);
  check("returns an id", typeof created.customer?.id === "number", created);

  console.log("\nsecond lookup matches the existing row");
  const again = await call("find_or_create_customer", { name: "  ALI  " });
  check("case and whitespace normalise to the same customer", again.found === true, again);
  check("does not create a duplicate", again.created === false, again);
  check(
    "same id as before",
    again.customer?.id === created.customer?.id,
    { first: created.customer?.id, second: again.customer?.id },
  );

  console.log("\nsimilar-but-different name is surfaced, not merged or created");
  const similar = await call("find_or_create_customer", { name: "Ali Raza" });
  check("treated as a different person", similar.found === false, similar);
  check("did not create silently", similar.created === false, similar);
  check(
    "suggests Ali so the owner can confirm",
    Array.isArray(similar.suggestions) &&
      similar.suggestions.some((s: { name: string }) => s.name === "Ali"),
    similar,
  );

  await client.close();
  await clearFixtures();
  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("test-customer-tools FAILED:", error);
  process.exit(1);
});
