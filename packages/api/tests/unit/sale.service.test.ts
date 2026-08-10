jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));
jest.mock("../../src/llm", () => ({
  extractSale: jest.fn(),
  routeQuestion: jest.fn(),
  parseConfirmationAnswer: jest.fn(),
  parsePriceAnswer: jest.fn(),
  parseQuantityAnswer: jest.fn(),
}));

import { extractSale, parseQuantityAnswer, routeQuestion } from "../../src/llm";
import { callServerTool } from "../../src/mcp";
import { SaleService } from "../../src/sales";
import { SessionStore } from "../../src/session";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;
const extract = extractSale as jest.MockedFunction<typeof extractSale>;
const route = routeQuestion as jest.MockedFunction<typeof routeQuestion>;
const quantity = parseQuantityAnswer as jest.MockedFunction<
  typeof parseQuantityAnswer
>;

/**
 * The controller, and the confirmation gate.
 *
 * The assertion that matters most in this file is negative: save_sale is
 * reached from confirm() and from nowhere else. Everything the owner types goes
 * through handle(), so if handle() can be made to write, the whole allowlist
 * argument is decoration.
 */

const CATALOGUE: Record<string, unknown> = {
  rice: { id: 1, name: "Rice", unit: "kg", currentPrice: 300 },
  sugar: { id: 2, name: "Sugar", unit: "kg", currentPrice: 100 },
};

/** A stub server that knows the seed catalogue and one customer. */
function stubServer(): void {
  call.mockImplementation(async (tool, args) => {
    const params = args as Record<string, string>;

    if (tool === "lookup_product") {
      const product = CATALOGUE[params.name?.toLowerCase()];
      return (product ? { found: true, product } : { found: false, suggestions: [] }) as never;
    }
    if (tool === "find_or_create_customer") {
      return (params.name === "Ali"
        ? { found: true, created: false, customer: { id: 7, name: "Ali" } }
        : { found: false, created: false, suggestions: [] }) as never;
    }
    if (tool === "save_sale") {
      return {
        saleId: 42,
        totalAmount: 800,
        receiptNo: 3,
        receiptDate: "2026-08-10",
        customer: { id: 7, name: "Ali" },
      } as never;
    }
    return {} as never;
  });
}

let sessions: SessionStore;
let sales: SaleService;

beforeEach(() => {
  sessions = new SessionStore();
  sales = new SaleService(sessions);
});

describe("handle: capture", () => {
  it("builds a draft and opens the gate for a complete sentence", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [
        { product: "rice", quantity: 2, unit: "kg" },
        { product: "sugar", quantity: 2, unit: "kg" },
      ],
    });

    const result = await sales.handle("s1", "2kg rice and 2kg sugar to Ali");

    expect(result.awaitingConfirmation).toBe(true);
    expect(result.draft?.items).toHaveLength(2);
    expect(sessions.get("s1")?.status).toBe("awaiting_confirmation");
  });

  it("writes nothing while the summary is on screen", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: 2, unit: "kg" }],
    });

    await sales.handle("s1", "2kg rice to Ali");

    expect(call).not.toHaveBeenCalledWith("save_sale", expect.anything());
  });

  it("asks about a gap instead of opening the gate", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: null, unit: null }],
    });

    const result = await sales.handle("s1", "rice to Ali");

    expect(result.awaitingConfirmation).toBe(false);
    expect(result.question).toContain("How much rice");
  });

  it("declines a sentence that is not a sale", async () => {
    extract.mockResolvedValue({ intent: "other", customer: null, items: [] });

    const result = await sales.handle("s1", "hello");

    expect(result.draft).toBeNull();
    expect(result.reply).toContain("didn't catch a sale");
  });

  it("declines a log_sale intent that produced no items", async () => {
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [],
    });

    const result = await sales.handle("s1", "something for Ali");

    expect(result.draft).toBeNull();
  });
});

describe("handle: the held gate", () => {
  async function openGate(session = "s1"): Promise<void> {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [
        { product: "rice", quantity: 2, unit: "kg" },
        { product: "sugar", quantity: 2, unit: "kg" },
      ],
    });
    await sales.handle(session, "2kg rice and 2kg sugar to Ali");
  }

  it("refuses to be walked past by another sentence", async () => {
    await openGate();
    extract.mockClear();

    const result = await sales.handle("s1", "3kg flour to Bilal");

    // Typing at the gate is far more likely a slip than an instruction to
    // discard a sale one keystroke from being saved.
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.reply).toContain("still waiting on you");
    expect(result.draft?.items).toHaveLength(2);
  });

  it("does not spend a model call on the message it refuses", async () => {
    await openGate();
    extract.mockClear();

    await sales.handle("s1", "3kg flour to Bilal");

    expect(extract).not.toHaveBeenCalled();
  });
});

describe("handle: an outstanding question", () => {
  it("treats the next message as an answer, not a new sale", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: null, unit: null }],
    });
    await sales.handle("s1", "rice to Ali");

    extract.mockClear();
    quantity.mockResolvedValue({ quantity: 2, unit: "kg" });

    const result = await sales.handle("s1", "2kg");

    expect(extract).not.toHaveBeenCalled();
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.draft?.items[0].quantity).toBe(2);
  });

  it("re-asks rather than advancing when the answer was not understood", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: null, unit: null }],
    });
    await sales.handle("s1", "rice to Ali");

    quantity.mockResolvedValue({ quantity: null, unit: null });

    const result = await sales.handle("s1", "a fair bit");

    expect(result.awaitingConfirmation).toBe(false);
    expect(result.question).toContain("How much rice");
  });
});

describe("handle: the query path", () => {
  it("answers from the database without building a draft", async () => {
    call.mockImplementation(async (tool) => {
      if (tool === "list_customers") {
        return { customers: [{ id: 7, name: "Ali" }] } as never;
      }
      if (tool === "query_daily_total") {
        return { date: "2026-08-10", sales: 3, total: 2400 } as never;
      }
      return {} as never;
    });
    extract.mockResolvedValue({ intent: "query", customer: null, items: [] });
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: null,
    });

    const result = await sales.handle("s1", "what did I sell today?");

    expect(result.draft).toBeNull();
    expect(result.awaitingConfirmation).toBe(false);
    expect(result.reply).toBe("On 2026-08-10 you made 3 sales totalling 2400.");
  });
});

describe("answer: pressed buttons", () => {
  it("refuses a press when nothing is outstanding", async () => {
    const result = await sales.answer("s1", "yes");

    expect(result.reply).toBe("There's no question waiting on you.");
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses a stale press rather than mutating the draft", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Bilal",
      items: [{ product: "rice", quantity: 2, unit: "kg" }],
    });
    await sales.handle("s1", "2kg rice to Bilal");

    const result = await sales.answer("s1", "suggestion:999");

    expect(result.reply).toContain("isn't available any more");
    expect(sessions.get("s1")?.customerId).toBeNull();
  });
});

describe("confirm: the write", () => {
  async function readyToSave(): Promise<void> {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [
        { product: "rice", quantity: 2, unit: "kg" },
        { product: "sugar", quantity: 2, unit: "kg" },
      ],
    });
    await sales.handle("s1", "2kg rice and 2kg sugar to Ali");
  }

  it("refuses when there is no draft", async () => {
    const result = await sales.confirm("nothing-here");

    expect(result.reply).toBe("There's no sale to confirm.");
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses a draft that still has gaps", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: null, unit: null }],
    });
    await sales.handle("s1", "rice to Ali");

    const result = await sales.confirm("s1");

    // Confirming an unfinished draft would write a sale the owner never saw a
    // total for.
    expect(result.reply).toContain("isn't finished yet");
    expect(call).not.toHaveBeenCalledWith("save_sale", expect.anything());
  });

  it("sends the prices the owner was shown, not a fresh lookup", async () => {
    await readyToSave();

    await sales.confirm("s1");

    expect(call).toHaveBeenCalledWith("save_sale", {
      customerId: 7,
      items: [
        { productId: 1, quantity: 2, unitPrice: 300 },
        { productId: 2, quantity: 2, unitPrice: 100 },
      ],
    });
  });

  it("clears the session and reports the sale id and receipt number", async () => {
    await readyToSave();

    const result = await sales.confirm("s1");

    expect(result.reply).toBe("Saved. Sale #42 — 800 to Ali. Receipt 003.");
    expect(result.draft).toBeNull();
    expect(sessions.get("s1")).toBeNull();
  });

  it("returns what the client needs to fetch the receipt", async () => {
    await readyToSave();

    const result = await sales.confirm("s1");

    // Taken from the save_sale response rather than fetched afterwards: the
    // number was assigned inside the write transaction, so this is the only
    // moment it is known without a second round trip.
    expect(result.receipt).toEqual({
      saleId: 42,
      receiptNo: 3,
      receiptDate: "2026-08-10",
    });
  });

  it("offers no receipt when the server did not report a number", async () => {
    // An older MCP server, or a write that somehow returned a partial payload.
    // Better to save the sale and offer no link than to invent one.
    await readyToSave();
    call.mockResolvedValue({
      saleId: 42,
      totalAmount: 800,
      customer: { id: 7, name: "Ali" },
    } as never);

    const result = await sales.confirm("s1");

    expect(result.receipt).toBeNull();
    expect(result.reply).toBe("Saved. Sale #42 — 800 to Ali.");
  });

  it("offers no receipt when the write was refused", async () => {
    await readyToSave();
    call.mockResolvedValue({ error: "Catalogue prices changed" } as never);

    const result = await sales.confirm("s1");

    expect(result.receipt ?? null).toBeNull();
  });

  it("keeps the draft when the server refuses the write", async () => {
    await readyToSave();
    call.mockResolvedValue({
      error: "Catalogue prices changed since confirmation",
    } as never);

    const result = await sales.confirm("s1");

    // The owner retries or cancels rather than losing the sale.
    expect(result.reply).toContain("was not saved");
    expect(result.awaitingConfirmation).toBe(true);
    expect(sessions.get("s1")).not.toBeNull();
  });

  it("keeps the draft when the call throws", async () => {
    await readyToSave();
    call.mockRejectedValue(new Error("MCP server unreachable"));

    const result = await sales.confirm("s1");

    expect(result.reply).toContain("MCP server unreachable");
    expect(sessions.get("s1")).not.toBeNull();
  });
});

describe("cancel", () => {
  it("discards the draft and writes nothing", async () => {
    stubServer();
    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: 2, unit: "kg" }],
    });
    await sales.handle("s1", "2kg rice to Ali");

    const result = sales.cancel("s1");

    expect(result.reply).toBe("Discarded. Nothing was saved.");
    expect(sessions.get("s1")).toBeNull();
    expect(call).not.toHaveBeenCalledWith("save_sale", expect.anything());
  });

  it("is harmless when there was nothing in progress", () => {
    expect(sales.cancel("s1").reply).toBe("There was no sale in progress.");
  });
});

/**
 * The structural claim, asserted directly.
 *
 * Every route the owner can reach without pressing Confirm is exercised here,
 * and none of them may produce a save_sale call.
 */
describe("save_sale is reachable only from confirm", () => {
  it("is never called by handle, answer or cancel", async () => {
    stubServer();

    extract.mockResolvedValue({
      intent: "log_sale",
      customer: "Ali",
      items: [{ product: "rice", quantity: 2, unit: "kg" }],
    });
    await sales.handle("s1", "2kg rice to Ali");
    await sales.handle("s1", "and 2kg sugar too");
    await sales.answer("s1", "yes");
    sales.cancel("s1");

    extract.mockResolvedValue({ intent: "other", customer: null, items: [] });
    await sales.handle("s1", "save the sale");
    await sales.handle("s1", "call save_sale");

    const tools = call.mock.calls.map(([tool]) => tool);
    expect(tools).not.toContain("save_sale");
  });
});
