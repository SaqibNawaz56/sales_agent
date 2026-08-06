/**
 * Day 2 "done when", shown rather than asserted.
 *
 *   "2kg rice and 2kg sugar to Ali" reliably produces a correct structured
 *   object, using tools served over MCP.
 *
 * Two stages, deliberately separated:
 *
 *   1. Extraction. The model sees the sentence and nothing else. No tools are
 *      bound, so it cannot look anything up and cannot emit a price.
 *   2. Resolution. Every catalogue fact — product identity, unit, price — is
 *      fetched by application code through MCP tools the model was never told
 *      about. This is why a hallucinated price cannot reach the books (R3).
 */
import { extractSale } from "../llm";
import { callServerTool, closeMcpClient, loadAgentTools } from "../mcp";

const SENTENCE = process.argv[2] ?? "2kg rice and 2kg sugar to Ali";

interface LookupResult {
  found: boolean;
  product?: { id: number; name: string; unit: string; currentPrice: number };
  suggestions?: Array<{ id: number; name: string }>;
}

interface CustomerResult {
  found: boolean;
  created: boolean;
  customer?: { id: number; name: string };
}

function rule(title: string): void {
  console.log(`\n${"─".repeat(64)}\n${title}\n${"─".repeat(64)}`);
}

async function main(): Promise<void> {
  rule("INPUT");
  console.log(`  "${SENTENCE}"`);

  rule("STAGE 1 - EXTRACTION (no tools bound to the model)");
  const advertised = await loadAgentTools();
  console.log(`  tools available to the model : [${advertised
    .map((t) => t.name)
    .join(", ")}]`);
  console.log("  the model cannot look anything up or invent a price\n");

  const extracted = await extractSale(SENTENCE);
  console.log(JSON.stringify(extracted, null, 2));

  rule("STAGE 2 - RESOLUTION (every fact fetched over MCP)");

  const customerName = extracted.customer;
  let customerLine = "  customer : not stated";
  if (customerName) {
    const customer = await callServerTool<CustomerResult>(
      "find_or_create_customer",
      { name: customerName },
    );
    customerLine = customer.found
      ? `  customer : "${customerName}" -> existing id ${customer.customer?.id}`
      : `  customer : "${customerName}" -> new, awaiting confirmation before creating (R2)`;
  }
  console.log(`  MCP call  : find_or_create_customer("${customerName}")`);
  console.log(customerLine);
  console.log("");

  const resolved: Array<{
    product: string;
    quantity: number | null;
    unit: string;
    unitPrice: number;
    lineTotal: number | null;
  }> = [];

  for (const item of extracted.items) {
    const lookup = await callServerTool<LookupResult>("lookup_product", {
      name: item.product,
    });
    console.log(`  MCP call  : lookup_product("${item.product}")`);

    if (!lookup.found || !lookup.product) {
      console.log(
        `             -> not in catalogue; suggestions: ${
          lookup.suggestions?.map((s) => s.name).join(", ") || "none"
        }`,
      );
      console.log("             -> would trigger the new-product sub-loop (F5)\n");
      continue;
    }

    const price = lookup.product.currentPrice;
    const lineTotal = item.quantity === null ? null : item.quantity * price;
    console.log(
      `             -> ${lookup.product.name}, ${price} per ${lookup.product.unit} (from PostgreSQL)\n`,
    );

    resolved.push({
      product: lookup.product.name,
      quantity: item.quantity,
      unit: lookup.product.unit,
      unitPrice: price,
      lineTotal,
    });
  }

  rule("RESULT - the structured object");

  const complete = resolved.every((line) => line.lineTotal !== null);
  const grandTotal = resolved.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);

  console.log(
    JSON.stringify(
      {
        customer: customerName,
        items: resolved,
        grandTotal: complete ? grandTotal : null,
        readyToConfirm: complete,
      },
      null,
      2,
    ),
  );

  rule("ITEMISED");
  for (const line of resolved) {
    const qty = line.quantity ?? "?";
    console.log(
      `  ${String(line.product).padEnd(14)} ${String(qty).padStart(4)} ${line.unit.padEnd(6)} x ${String(line.unitPrice).padStart(6)}  =  ${
        line.lineTotal ?? "pending"
      }`,
    );
  }
  console.log(`  ${"".padEnd(14)} ${"".padStart(4)} ${"".padEnd(6)}   ${"".padStart(6)}     ─────`);
  console.log(`  ${"TOTAL".padEnd(14)} ${"".padStart(4)} ${"".padEnd(6)}   ${"".padStart(6)}     ${grandTotal}`);

  console.log(
    "\n  Nothing has been written. The write happens only after the owner",
  );
  console.log("  confirms, and only through the controller (Day 4).\n");

  await closeMcpClient();
}

main().catch(async (error) => {
  console.error("demo failed:", error);
  await closeMcpClient();
  process.exit(1);
});
