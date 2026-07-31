/**
 * The five integration tests named in the Day 7 plan.
 *
 * These run against the live stack — real MCP server, real PostgreSQL, real
 * Groq. They are slow and they cost tokens, which is the point: a mocked
 * version of these would prove that the mocks agree with each other.
 *
 * Run:  docker compose exec -w /app/packages/api api npm test
 */
import request from "supertest";

import { createApp } from "../src/app.js";
import { callServerTool, closeMcpClient } from "../src/mcp.js";

const app = createApp();

/** A product name that cannot already be in the catalogue. */
const NEW_PRODUCT = `Spice${Date.now()}`;

interface DailyTotal {
  sales: number;
  total: number;
}

async function salesToday(): Promise<DailyTotal> {
  return callServerTool<DailyTotal>("query_daily_total", {});
}

/** Groq's free tier is 12k tokens/minute; these tests are chatty. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PACE = 3_000;

beforeAll(async () => {
  await callServerTool("find_or_create_customer", {
    name: "Ali",
    createIfMissing: true,
  });
});

afterAll(async () => {
  await closeMcpClient();
});

beforeEach(async () => {
  await sleep(PACE);
});

describe("save_sale is never advertised to the model", () => {
  // Cheapest and most important of the five: the write tool must be invisible.
  it("is absent from the agent's tool list", async () => {
    const response = await request(app).get("/api/tools").expect(200);

    expect(response.body.tools).toBeDefined();
    expect(response.body.tools.length).toBeGreaterThan(0);
    expect(response.body.tools).not.toContain("save_sale");
    expect(response.body.tools).not.toContain("list_customers");
  });
});

describe("happy path", () => {
  it("logs a complete multi-item sale and writes it on confirmation", async () => {
    const session = `jest-happy-${Date.now()}`;
    const before = await salesToday();

    const chat = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: "2kg rice and 2kg sugar to Ali" })
      .expect(200);

    expect(chat.body.awaitingConfirmation).toBe(true);
    expect(chat.body.draftSale.grandTotal).toBe(800);
    expect(chat.body.draftSale.items).toHaveLength(2);

    // Still nothing written while the summary is on screen.
    expect((await salesToday()).sales).toBe(before.sales);

    const confirmed = await request(app)
      .post("/api/sales/confirm")
      .send({ sessionId: session, confirmed: true })
      .expect(200);

    expect(confirmed.body.saved).toBe(true);

    const after = await salesToday();
    expect(after.sales).toBe(before.sales + 1);
    expect(after.total).toBe(before.total + 800);
  });
});

describe("missing quantity path", () => {
  it("asks exactly one targeted question and keeps the rest of the sale", async () => {
    const session = `jest-qty-${Date.now()}`;

    const first = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: "2kg rice, 2kg sugar and oil to Ali" })
      .expect(200);

    expect(first.body.awaitingConfirmation).toBe(false);
    expect(first.body.reply.toLowerCase()).toContain("how much oil");

    await sleep(PACE);

    const second = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: "2 litres" })
      .expect(200);

    // One question, then done — and nothing already understood was lost.
    expect(second.body.awaitingConfirmation).toBe(true);
    expect(second.body.draftSale.items).toHaveLength(3);
    expect(second.body.draftSale.grandTotal).toBe(1800);

    await request(app)
      .post("/api/sales/confirm")
      .send({ sessionId: session, confirmed: false })
      .expect(200);
  });
});

describe("new-product path", () => {
  it("pauses, takes a price, adds the product, and resumes the same sale", async () => {
    const session = `jest-new-${Date.now()}`;

    const offered = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: `2kg rice and 1kg ${NEW_PRODUCT} to Ali` })
      .expect(200);

    expect(offered.body.reply.toLowerCase()).toContain("add it");

    await sleep(PACE);
    const asked = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: "yes" })
      .expect(200);

    expect(asked.body.reply.toLowerCase()).toContain("price");

    await sleep(PACE);
    const resumed = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: "500" })
      .expect(200);

    expect(resumed.body.awaitingConfirmation).toBe(true);
    // Rice survived the sub-loop: 600 + 500.
    expect(resumed.body.draftSale.items).toHaveLength(2);
    expect(resumed.body.draftSale.grandTotal).toBe(1100);

    // The price the owner supplied is now the catalogue's.
    const lookup = await callServerTool<{ found: boolean; product?: { currentPrice: number } }>(
      "lookup_product",
      { name: NEW_PRODUCT },
    );
    expect(lookup.found).toBe(true);
    expect(lookup.product?.currentPrice).toBe(500);

    await request(app)
      .post("/api/sales/confirm")
      .send({ sessionId: session, confirmed: false })
      .expect(200);
  });
});

describe("rejected confirmation path", () => {
  it("writes nothing when the owner declines", async () => {
    const session = `jest-reject-${Date.now()}`;
    const before = await salesToday();

    const chat = await request(app)
      .post("/api/chat")
      .send({ sessionId: session, message: "3kg flour and 2kg sugar to Ali" })
      .expect(200);

    expect(chat.body.awaitingConfirmation).toBe(true);

    const rejected = await request(app)
      .post("/api/sales/confirm")
      .send({ sessionId: session, confirmed: false })
      .expect(200);

    expect(rejected.body.reply).toMatch(/Nothing was saved/i);

    const after = await salesToday();
    expect(after.sales).toBe(before.sales);
    expect(after.total).toBe(before.total);
  });

  it("refuses a confirm request with no 'confirmed' flag", async () => {
    // A missing flag must never be read as consent to write.
    await request(app)
      .post("/api/sales/confirm")
      .send({ sessionId: "jest-noflag" })
      .expect(400);
  });
});
