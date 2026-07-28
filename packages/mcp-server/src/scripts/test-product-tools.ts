/**
 * Exercises the catalogue tools over MCP, including the paths that matter for
 * risk R2 (typos) and feature F5 (new-product onboarding).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { prisma } from "../db.js";
import { normalize } from "../normalize.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp");

/** Products this test creates. Removed before and after so runs are repeatable. */
const FIXTURES = ["Biryani Masala", "Nonsense Item"];

async function clearFixtures(): Promise<void> {
  await prisma.product.deleteMany({
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

  const client = new Client({ name: "product-tool-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(url));

  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    const content = response.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0].text);
  };

  console.log("\nlookup_product - exact match");
  const rice = await call("lookup_product", { name: "rice" });
  check("finds rice", rice.found === true, rice);
  check("returns its price", rice.product?.currentPrice === 300, rice);
  check("returns its unit", rice.product?.unit === "kg", rice);

  console.log("\nlookup_product - normalisation");
  const messy = await call("lookup_product", { name: "  COOKING   Oil " });
  check("case and whitespace are normalised", messy.found === true, messy);

  console.log("\nlookup_product - typo suggests the right product (R2)");
  const typo = await call("lookup_product", { name: "suger" });
  check("does not match exactly", typo.found === false, typo);
  check(
    "suggests sugar",
    Array.isArray(typo.suggestions) &&
      typo.suggestions.some((s: { name: string }) => s.name === "Sugar"),
    typo,
  );

  console.log("\nlookup_product - genuinely unknown product");
  const unknown = await call("lookup_product", { name: "biryani masala" });
  check("reports not found", unknown.found === false, unknown);

  console.log("\ncreate_product - new-product sub-loop (F5)");
  const created = await call("create_product", {
    name: "Biryani Masala",
    unit: "packet",
    price: 250,
  });
  check("creates the product", created.created === true, created);

  const again = await call("create_product", {
    name: "biryani masala",
    unit: "packet",
    price: 250,
  });
  check("re-creating is a safe no-op", again.created === false, again);

  const nowFound = await call("lookup_product", { name: "Biryani Masala" });
  check("is findable afterwards", nowFound.found === true, nowFound);
  check("kept the owner's price", nowFound.product?.currentPrice === 250, nowFound);

  console.log("\ncreate_product - rejects invalid input");
  // The Zod schema sits on the tool boundary, so the SDK rejects this before
  // the handler is ever entered. A rejected promise is the expected outcome —
  // the bad value never reaches application code, let alone the database.
  let rejected = false;
  try {
    await call("create_product", { name: "Nonsense Item", unit: "kg", price: -5 });
  } catch {
    rejected = true;
  }
  check("negative price is rejected at the schema boundary", rejected);

  const notCreated = await call("lookup_product", { name: "Nonsense Item" });
  check("and nothing was written", notCreated.found === false, notCreated);

  await client.close();

  // Leave the catalogue exactly as the seed left it.
  await clearFixtures();
  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("test-product-tools FAILED:", error);
  process.exit(1);
});
