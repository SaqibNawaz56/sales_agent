/**
 * Exercises save_sale over MCP.
 *
 * Covers success criterion 8 (a rejected write leaves the database unchanged)
 * and success criterion 9 (line prices stay correct after the catalogue price
 * is edited).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { prisma } from "../db.js";
import { normalize } from "../normalize.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp");

const CUSTOMER = "Sale Test Customer";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`, detail ? JSON.stringify(detail) : "");
    failures++;
  }
}

async function cleanup(): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { normalizedName: normalize(CUSTOMER) },
  });
  if (customer) {
    // sale_items cascade from sales.
    await prisma.sale.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
}

async function main(): Promise<void> {
  await cleanup();

  const client = new Client({ name: "save-sale-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(url));

  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    const content = response.content as Array<{ type: string; text: string }>;
    return { parsed: JSON.parse(content[0].text), isError: response.isError === true };
  };

  console.log("\nsave_sale is on the server");
  const { tools } = await client.listTools();
  check(
    "server exposes save_sale",
    tools.some((tool) => tool.name === "save_sale"),
    tools.map((t) => t.name),
  );

  // Fixtures: a customer, and two seeded products at known prices.
  const customer = await prisma.customer.create({
    data: { name: CUSTOMER, normalizedName: normalize(CUSTOMER) },
  });
  const rice = await prisma.product.findUniqueOrThrow({
    where: { normalizedName: "rice" },
  });
  const sugar = await prisma.product.findUniqueOrThrow({
    where: { normalizedName: "sugar" },
  });

  console.log("\nhappy path - 2kg rice + 2kg sugar");
  const saved = await call("save_sale", {
    customerId: customer.id,
    items: [
      { productId: rice.id, quantity: 2, unitPrice: 300 },
      { productId: sugar.id, quantity: 2, unitPrice: 100 },
    ],
  });
  check("write succeeded", !saved.isError, saved.parsed);
  check("grand total is 800", saved.parsed.totalAmount === 800, saved.parsed);
  check("two line items written", saved.parsed.items?.length === 2, saved.parsed);
  check(
    "rice line total is 600",
    saved.parsed.items?.some(
      (i: { productId: number; lineTotal: number }) =>
        i.productId === rice.id && i.lineTotal === 600,
    ),
    saved.parsed,
  );

  const saleId: number = saved.parsed.saleId;

  console.log("\ncriterion 9 - snapshot survives a catalogue price change");
  await prisma.product.update({
    where: { id: rice.id },
    data: { currentPrice: 350 },
  });
  const afterChange = await prisma.saleItem.findFirstOrThrow({
    where: { saleId, productId: rice.id },
  });
  check(
    "sale_items still records the price actually charged",
    Number(afterChange.unitPriceSnapshot.toString()) === 300,
    { snapshot: afterChange.unitPriceSnapshot.toString() },
  );
  check(
    "line total unchanged",
    Number(afterChange.lineTotal.toString()) === 600,
    { lineTotal: afterChange.lineTotal.toString() },
  );

  console.log("\nstale confirmation is refused");
  const salesBefore = await prisma.sale.count();
  const stale = await call("save_sale", {
    customerId: customer.id,
    // 300 was the price the owner saw; the catalogue now says 350.
    items: [{ productId: rice.id, quantity: 1, unitPrice: 300 }],
  });
  check("write was rejected", stale.isError, stale.parsed);
  check(
    "no sale was written",
    (await prisma.sale.count()) === salesBefore,
    { before: salesBefore, after: await prisma.sale.count() },
  );

  await prisma.product.update({
    where: { id: rice.id },
    data: { currentPrice: 300 },
  });

  console.log("\ncriterion 8 - a failed write leaves nothing behind");
  const beforeBad = await prisma.sale.count();
  const beforeItems = await prisma.saleItem.count();
  const bad = await call("save_sale", {
    customerId: customer.id,
    items: [
      { productId: rice.id, quantity: 1, unitPrice: 300 },
      { productId: 999_999, quantity: 1, unitPrice: 50 },
    ],
  });
  check("write was rejected", bad.isError, bad.parsed);
  check(
    "no partial sale row",
    (await prisma.sale.count()) === beforeBad,
    { before: beforeBad, after: await prisma.sale.count() },
  );
  check(
    "no orphan line items - the valid item was rolled back too",
    (await prisma.saleItem.count()) === beforeItems,
    { before: beforeItems, after: await prisma.saleItem.count() },
  );

  console.log("\nempty sale is rejected at the schema boundary");
  let rejected = false;
  try {
    await call("save_sale", { customerId: customer.id, items: [] });
  } catch {
    rejected = true;
  }
  check("a sale with no items cannot be written", rejected);

  await client.close();
  await cleanup();
  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-save-sale FAILED:", error);
  await prisma.$disconnect();
  process.exit(1);
});
