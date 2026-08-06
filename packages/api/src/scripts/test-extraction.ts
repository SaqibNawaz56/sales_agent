/**
 * Day 2 "done when": a multi-item sentence reliably produces a correct
 * structured object.
 *
 * These cases are the extraction regression suite. Every prompt revision is
 * re-run against all of them, because fixing one sentence by rewording the
 * prompt routinely breaks another.
 */
import { extractSale, type ExtractedSale } from "../llm";

interface Case {
  name: string;
  message: string;
  expect: (result: ExtractedSale) => boolean;
  why: string;
}

function item(result: ExtractedSale, product: string) {
  return result.items.find((entry) =>
    entry.product.toLowerCase().includes(product),
  );
}

const CASES: Case[] = [
  {
    name: "multi-item sale",
    message: "2kg rice and 2kg sugar to Ali",
    why: "customer Ali, rice 2 kg, sugar 2 kg",
    expect: (r) =>
      r.intent === "log_sale" &&
      r.customer?.toLowerCase() === "ali" &&
      r.items.length === 2 &&
      item(r, "rice")?.quantity === 2 &&
      item(r, "sugar")?.quantity === 2,
  },
  {
    name: "spelled-out number (R1)",
    message: "two kg sugar to Ali",
    why: 'quantity must be 2, not 20',
    expect: (r) => item(r, "sugar")?.quantity === 2,
  },
  {
    name: "three items, one without a unit",
    message: "2kg rice, 2kg sugar and 1 oil to Ali",
    why: "three items extracted, oil quantity 1",
    expect: (r) => r.items.length === 3 && item(r, "oil")?.quantity === 1,
  },
  {
    name: "missing quantity is null, not guessed",
    message: "sold oil to Ali",
    why: "quantity must be null so the checklist can ask (F3/F4)",
    expect: (r) =>
      r.items.length === 1 && item(r, "oil")?.quantity === null,
  },
  {
    name: "mixed - one quantity present, one missing",
    message: "1 dozen eggs and bread to Bilal",
    why: "eggs 1 dozen, bread quantity null",
    expect: (r) =>
      item(r, "egg")?.quantity === 1 && item(r, "bread")?.quantity === null,
  },
  {
    name: "units are captured",
    message: "sold 3 litres milk to Fatima",
    why: "milk quantity 3, unit litre",
    expect: (r) =>
      item(r, "milk")?.quantity === 3 &&
      (item(r, "milk")?.unit ?? "").toLowerCase().startsWith("litre"),
  },
  {
    name: "no customer named",
    message: "2kg rice",
    why: "customer null so the controller knows to ask",
    expect: (r) => r.customer === null && r.items.length === 1,
  },
  {
    name: "decimal quantity",
    message: "half kg chilli powder to Ali",
    why: "half becomes 0.5",
    expect: (r) => item(r, "chilli")?.quantity === 0.5,
  },
  {
    name: "a question is not a sale",
    message: "what did I sell today?",
    why: "intent query, no items invented",
    expect: (r) => r.intent === "query" && r.items.length === 0,
  },
  {
    name: "no price is ever emitted (R3)",
    message: "2kg rice at 300 rupees to Ali",
    why: "the schema has no price field; 300 must not become a quantity",
    expect: (r) => item(r, "rice")?.quantity === 2,
  },
];

/**
 * Groq's free tier caps tokens per minute, and this suite is deliberately
 * chatty. Pacing it keeps a throttled run from being misread as an extraction
 * regression — the failure modes look nothing alike, but only if the 429 is
 * visible rather than buried under retries.
 */
const PACING_MS = 4_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  let failures = 0;
  let first = true;

  for (const testCase of CASES) {
    if (!first) await sleep(PACING_MS);
    first = false;
    let result: ExtractedSale | undefined;
    let ok = false;
    try {
      result = await extractSale(testCase.message);
      ok = testCase.expect(result);
    } catch (error) {
      console.log(`  FAIL  ${testCase.name} - threw:`, error);
    }

    if (ok) {
      console.log(`  PASS  ${testCase.name}`);
    } else {
      failures++;
      console.log(`  FAIL  ${testCase.name}`);
      console.log(`        message : ${testCase.message}`);
      console.log(`        expected: ${testCase.why}`);
      console.log(`        got     : ${JSON.stringify(result)}`);
    }
  }

  console.log(
    `\n${CASES.length - failures}/${CASES.length} passed\n`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("test-extraction FAILED:", error);
  process.exit(1);
});
