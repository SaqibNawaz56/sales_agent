/**
 * The three read tools (criterion 10).
 *
 * Fixtures are written with Prisma directly rather than through the sale flow,
 * so these assertions test the queries and nothing else — no model involved.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { prisma } from "../db.js";
import { normalize } from "../normalize.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp");
const CUSTOMER = "Query Test Customer";

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
    await prisma.receipt.deleteMany({ where: { customerId: customer.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }
}

async function main(): Promise<void> {
  await cleanup();

  const client = new Client({ name: "query-tool-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(url));

  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    const content = response.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0].text);
  };

  // Baseline: other rows may exist, so assertions are relative where needed.
  const baseline = await call("query_daily_total", {});

  const customer = await prisma.customer.create({
    data: { name: CUSTOMER, normalizedName: normalize(CUSTOMER) },
  });
  const rice = await prisma.product.findUniqueOrThrow({ where: { normalizedName: "rice" } });
  const sugar = await prisma.product.findUniqueOrThrow({ where: { normalizedName: "sugar" } });

  // receipt_date/receipt_no have no default, so rows written directly rather
  // than through save_sale have to number themselves. Continuing from the day's
  // highest rather than starting at 1 keeps this off any receipt number the
  // shop's real rows already hold — the unique index would refuse a collision.
  const now = new Date();
  const receiptDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const highest = await prisma.receipt.aggregate({
    where: { receiptDate },
    _max: { receiptNo: true },
  });
  const firstNo = (highest._max.receiptNo ?? 0) + 1;

  // Sale 1: 2kg rice + 2kg sugar = 800.  Sale 2: 1kg rice = 300.
  await prisma.receipt.create({
    data: {
      customerId: customer.id,
      totalAmount: 800,
      receiptDate,
      receiptNo: firstNo,
      items: {
        create: [
          { productId: rice.id, quantity: 2, unitPriceSnapshot: 300, lineTotal: 600 },
          { productId: sugar.id, quantity: 2, unitPriceSnapshot: 100, lineTotal: 200 },
        ],
      },
    },
  });
  await prisma.receipt.create({
    data: {
      customerId: customer.id,
      totalAmount: 300,
      receiptDate,
      receiptNo: firstNo + 1,
      items: {
        create: [
          { productId: rice.id, quantity: 1, unitPriceSnapshot: 300, lineTotal: 300 },
        ],
      },
    },
  });

  console.log("\nquery_daily_total");
  const today = await call("query_daily_total", {});
  check("counts the two new sales", today.sales === baseline.sales + 2, { today, baseline });
  check("adds 1100 to the day's total", today.total === baseline.total + 1100, { today, baseline });
  check("reports the date it used", /^\d{4}-\d{2}-\d{2}$/.test(today.date), today);

  const longAgo = await call("query_daily_total", { date: "2020-01-01" });
  check("a day with no sales returns zero, not an error", longAgo.sales === 0 && longAgo.total === 0, longAgo);

  console.log("\nquery_sales_by_customer");
  const byCustomer = await call("query_sales_by_customer", { customerName: CUSTOMER });
  check("finds the customer", byCustomer.found === true, byCustomer);
  check("counts both sales", byCustomer.sales === 2, byCustomer);
  check("totals 1100", byCustomer.total === 1100, byCustomer);

  const messyCase = await call("query_sales_by_customer", { customerName: `  ${CUSTOMER.toUpperCase()}  ` });
  check("name matching is normalised", messyCase.total === 1100, messyCase);

  const noSuchCustomer = await call("query_sales_by_customer", { customerName: "Nobody At All" });
  check("unknown customer reports found:false", noSuchCustomer.found === false, noSuchCustomer);
  check("with zeroes rather than an error", noSuchCustomer.total === 0, noSuchCustomer);

  console.log("\nquery_sales_by_product");
  const byProduct = await call("query_sales_by_product", { productName: "rice" });
  check("finds the product", byProduct.found === true, byProduct);
  check("sums quantity across sales (2 + 1)", byProduct.quantity === 3, byProduct);
  check("sums revenue across sales (600 + 300)", byProduct.revenue === 900, byProduct);
  check("reports the unit", byProduct.unit === "kg", byProduct);

  const noSuchProduct = await call("query_sales_by_product", { productName: "Nonexistent Thing" });
  check("unknown product reports found:false", noSuchProduct.found === false, noSuchProduct);

  console.log("\nrevenue uses snapshots, not the current price (F7)");
  await prisma.product.update({ where: { id: rice.id }, data: { currentPrice: 999 } });
  const afterPriceChange = await call("query_sales_by_product", { productName: "rice" });
  check("revenue is unchanged after a price rise", afterPriceChange.revenue === 900, afterPriceChange);
  await prisma.product.update({ where: { id: rice.id }, data: { currentPrice: 300 } });

  await client.close();
  await cleanup();
  await prisma.$disconnect();

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("test-query-tools FAILED:", error);
  await prisma.$disconnect();
  process.exit(1);
});
