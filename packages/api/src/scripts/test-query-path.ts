/**
 * The read path: pseudonymisation, routing, and locally-formatted answers.
 *
 * The assertion that matters is criterion 15 — the payload actually sent to
 * Groq is inspected, and must contain no real customer name. Everything else
 * here is in service of that being a meaningful claim rather than a hopeful one.
 *
 * Fixtures are created through MCP tools. verify-day5.ps1 clears them with psql.
 */
import { callServerTool, closeMcpClient } from "../mcp";
import {
  buildPseudonymMap,
  containsRealName,
  detokenise,
  tokenise,
} from "../reporting";
import { answerQuery } from "../reporting";

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

interface CustomerResult {
  customer?: { id: number; name: string };
}
interface LookupResult {
  product?: { id: number; currentPrice: number };
}

async function main(): Promise<void> {
  // Fixtures: Ali and Ali Raza, so the longest-name-first rule is exercised.
  const ali = await callServerTool<CustomerResult>("find_or_create_customer", {
    name: "Ali",
    createIfMissing: true,
  });
  await callServerTool<CustomerResult>("find_or_create_customer", {
    name: "Ali Raza",
    createIfMissing: true,
  });

  const rice = await callServerTool<LookupResult>("lookup_product", { name: "rice" });
  await callServerTool("save_sale", {
    customerId: ali.customer?.id,
    items: [{ productId: rice.product?.id, quantity: 2, unitPrice: rice.product?.currentPrice }],
  });

  console.log("\ntokenisation");
  const map = await buildPseudonymMap();
  check("the map was built from the database", map.toToken.size >= 2, map.toToken.size);

  const tokenised = tokenise("how much has Ali bought?", map);
  check("the name is replaced by a token", /customer_\d+/.test(tokenised), tokenised);
  check("no real name survives", containsRealName(tokenised, map) === false, tokenised);

  const longest = tokenise("what has Ali Raza bought?", map);
  check(
    "longer names win, so Ali Raza is not split into 'customer_N Raza'",
    longest.includes("Raza") === false,
    longest,
  );

  const roundTrip = detokenise(tokenised, map);
  check("tokens map back to the real name", roundTrip.includes("Ali"), roundTrip);

  check("case is handled", containsRealName(tokenise("what did ALI buy?", map), map) === false);
  check("unrelated text is untouched", tokenise("how much rice?", map) === "how much rice?");

  console.log("\ncriterion 15 - the outbound payload carries no real name");
  const askedAboutAli = await answerQuery("how much has Ali bought?");
  check(
    "what was sent to the model contains a token",
    /customer_\d+/.test(askedAboutAli.outboundToModel),
    askedAboutAli.outboundToModel,
  );
  check(
    "and contains NO real customer name",
    containsRealName(askedAboutAli.outboundToModel, map) === false,
    askedAboutAli.outboundToModel,
  );
  check(
    "the model routed on the token",
    askedAboutAli.route.customer?.startsWith("customer_") === true,
    askedAboutAli.route,
  );
  check(
    "but the answer shown to the owner has the real name back",
    askedAboutAli.answer.includes("Ali"),
    askedAboutAli.answer,
  );
  // Derived, not hardcoded: this script adds a sale each time it runs, so a
  // fixed expectation would fail on the second run for the wrong reason.
  const expected = await callServerTool<{ total: number }>(
    "query_sales_by_customer",
    { customerName: "Ali" },
  );
  check(
    "with figures matching the database",
    askedAboutAli.answer.includes(String(expected.total)),
    { answer: askedAboutAli.answer, expected: expected.total },
  );

  console.log("\nrouting - all three tools");
  await sleep(PACING_MS);
  const daily = await answerQuery("what did I sell today?");
  check("routes to daily_total", daily.route.tool === "daily_total", daily.route);
  check("and answers with a figure", /\d/.test(daily.answer), daily.answer);

  await sleep(PACING_MS);
  const byProduct = await answerQuery("how much rice have I sold?");
  check("routes to sales_by_product", byProduct.route.tool === "sales_by_product", byProduct.route);
  check("names the product", byProduct.answer.toLowerCase().includes("rice"), byProduct.answer);

  console.log("\ngraceful handling");
  await sleep(PACING_MS);
  const vague = await answerQuery("how's business?");
  check("a vague question is not improvised on (R4)", vague.route.tool === "none", vague.route);
  check("it says what it can answer", vague.answer.includes("I can answer three things"), vague.answer);

  await sleep(PACING_MS);
  const noSales = await answerQuery("how much shampoo have I sold?");
  check("no results is handled plainly", noSales.answer.toLowerCase().includes("haven't sold any"), noSales.answer);

  await closeMcpClient();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-query-path FAILED:", error);
  await closeMcpClient();
  process.exit(1);
});
