jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));
jest.mock("../../src/llm", () => ({ routeQuestion: jest.fn() }));

import { routeQuestion } from "../../src/llm";
import { callServerTool } from "../../src/mcp";
import { answerQuery, plural } from "../../src/reporting";
import { containsRealName } from "../../src/reporting/pseudonym";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;
const route = routeQuestion as jest.MockedFunction<typeof routeQuestion>;

const CUSTOMERS = [
  { id: 1, name: "Ali" },
  { id: 2, name: "Bilal" },
];

/** Answers list_customers, then delegates the query tool to `handler`. */
function stubServer(handler: (tool: string, args: unknown) => unknown): void {
  call.mockImplementation(async (tool, args) => {
    if (tool === "list_customers") return { customers: CUSTOMERS } as never;
    return handler(tool, args) as never;
  });
}

/**
 * The read path.
 *
 * Two properties are under test and they are not the same. One is that the
 * right sentence comes out. The other — the reason this path exists in this
 * shape — is that no name and no figure is ever handed to Groq.
 */

describe("the privacy boundary", () => {
  it("tokenises the question before the model is called", async () => {
    stubServer(() => ({ found: true, customerName: "Ali", sales: 2, total: 900 }));
    route.mockResolvedValue({
      tool: "sales_by_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("how much has Ali bought?");

    const [sentToModel] = route.mock.calls[0];
    expect(sentToModel).toBe("how much has customer_1 bought?");
    expect(outcome.outboundToModel).toBe("how much has customer_1 bought?");
  });

  it("sends no real customer name to the model", async () => {
    stubServer(() => ({ found: true, customerName: "Ali", sales: 2, total: 900 }));
    route.mockResolvedValue({
      tool: "sales_by_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    await answerQuery("did Ali or Bilal buy more?");

    const [sentToModel] = route.mock.calls[0];
    const map = {
      toToken: new Map(CUSTOMERS.map((c) => [c.name, `customer_${c.id}`])),
      toReal: new Map(CUSTOMERS.map((c) => [`customer_${c.id}`, c.name])),
    };
    expect(containsRealName(sentToModel, map)).toBe(false);
  });

  it("builds the dictionary before it calls the model", async () => {
    stubServer(() => ({ date: "2026-08-10", sales: 0, total: 0 }));
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: null,
    });

    await answerQuery("what did I sell today?");

    // Ordering is the guarantee: a map built afterwards could not have
    // scrubbed the question that was already sent.
    expect(call).toHaveBeenCalledWith("list_customers", {});
    expect(call.mock.invocationCallOrder[0]).toBeLessThan(
      route.mock.invocationCallOrder[0],
    );
  });

  it("never sends a figure to the model to be phrased", async () => {
    stubServer(() => ({ date: "2026-08-10", sales: 3, total: 2400 }));
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did I sell today?");

    // The model was called exactly once, with the question, before any figure
    // existed. The sentence is assembled from tool results by code.
    expect(route).toHaveBeenCalledTimes(1);
    expect(outcome.answer).toContain("2400");
  });
});

describe("daily_total", () => {
  it("reports the day's takings", async () => {
    stubServer(() => ({ date: "2026-08-10", sales: 3, total: 2400 }));
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did I sell today?");

    expect(outcome.answer).toBe("On 2026-08-10 you made 3 sales totalling 2400.");
    // An aggregate covers many sales, so there is no single receipt to offer.
    // Only last_sale_for_customer names one.
    expect(outcome.receipt).toBeNull();
  });

  it("says so when there were none", async () => {
    stubServer(() => ({ date: "2026-08-09", sales: 0, total: 0 }));
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did I sell yesterday?");

    expect(outcome.answer).toBe("No sales recorded on 2026-08-09.");
  });

  it("passes a named date through to the tool", async () => {
    stubServer(() => ({ date: "2026-08-01", sales: 1, total: 300 }));
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: "2026-08-01",
    });

    await answerQuery("what did I sell on the first?");

    expect(call).toHaveBeenCalledWith("query_daily_total", {
      date: "2026-08-01",
    });
  });

  it("omits the date entirely when none was named", async () => {
    stubServer(() => ({ date: "2026-08-10", sales: 1, total: 300 }));
    route.mockResolvedValue({
      tool: "daily_total",
      customer: null,
      product: null,
      date: null,
    });

    await answerQuery("what did I sell today?");

    expect(call).toHaveBeenCalledWith("query_daily_total", {});
  });
});

describe("sales_by_customer", () => {
  it("resolves the token locally, then asks the database by real name", async () => {
    stubServer(() => ({
      found: true,
      customerName: "Ali",
      sales: 2,
      total: 900,
    }));
    route.mockResolvedValue({
      tool: "sales_by_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("how much has Ali bought?");

    expect(call).toHaveBeenCalledWith("query_sales_by_customer", {
      customerName: "Ali",
    });
    expect(outcome.answer).toBe("Ali has made 2 purchases totalling 900.");
  });

  it("rejects a token the system never issued", async () => {
    stubServer(() => ({ found: false }));
    route.mockResolvedValue({
      tool: "sales_by_customer",
      customer: "customer_99",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("how much has Zain bought?");

    expect(outcome.answer).toBe("I don't have that customer on file.");
    expect(call).not.toHaveBeenCalledWith(
      "query_sales_by_customer",
      expect.anything(),
    );
  });

  it("asks which customer when the model named none", async () => {
    stubServer(() => ({ found: false }));
    route.mockResolvedValue({
      tool: "sales_by_customer",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("how much have they bought?");

    expect(outcome.answer).toBe("Which customer did you mean?");
  });

  it("reports a customer on file with nothing recorded", async () => {
    stubServer(() => ({ found: true, customerName: "Ali", sales: 0, total: 0 }));
    route.mockResolvedValue({
      tool: "sales_by_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("how much has Ali bought?");

    expect(outcome.answer).toBe("I have no sales recorded for Ali.");
  });
});

describe("last_sale_for_customer", () => {
  const lastSale = {
    found: true,
    hasSale: true,
    customerName: "Ali",
    saleId: 49,
    receiptNo: 4,
    date: "2026-08-10",
    total: 1800,
    items: [
      { productName: "Rice", unit: "kg", quantity: 2, unitPrice: 300, lineTotal: 600 },
      { productName: "Sugar", unit: "kg", quantity: 2, unitPrice: 100, lineTotal: 200 },
      { productName: "Oil", unit: "litre", quantity: 2, unitPrice: 500, lineTotal: 1000 },
    ],
  };

  it("lists what the customer actually bought on their last visit", async () => {
    // The question this route exists for. Before it, "what did Ali buy last
    // time?" routed to sales_by_customer and answered with a lifetime total —
    // true, and a non-answer.
    stubServer(() => lastSale);
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(call).toHaveBeenCalledWith("query_last_sale_for_customer", {
      customerName: "Ali",
    });
    expect(outcome.answer).toBe(
      "Ali's last sale was on 2026-08-10: 2 kg of Rice at 300, 2 kg of Sugar at 100 and 2 litre of Oil at 500. That came to 1800.",
    );
  });

  it("sends no real name to the model", async () => {
    stubServer(() => lastSale);
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    await answerQuery("what did Ali buy last time?");

    expect(route.mock.calls[0][0]).toBe("what did customer_1 buy last time?");
  });

  /*
   * The receipt offered beside the answer.
   *
   * This is the only route that can offer one, because it is the only route
   * whose answer is about exactly one sale. The identifiers come from the
   * tool's own result — the model is never told this sale's id and so cannot
   * have chosen which receipt the owner is handed.
   */
  it("offers the receipt for the sale it just described", async () => {
    stubServer(() => lastSale);
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(outcome.receipt).toEqual({
      saleId: 49,
      receiptNo: 4,
      receiptDate: "2026-08-10",
    });
  });

  it("offers a receipt even when the sale has no line items", async () => {
    // The degenerate sale that still has a receipt number: the answer falls
    // back to a bare total, but the receipt is no less downloadable.
    stubServer(() => ({ ...lastSale, items: [] }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(outcome.answer).toBe("Ali's last sale on 2026-08-10 came to 1800.");
    expect(outcome.receipt).toEqual({
      saleId: 49,
      receiptNo: 4,
      receiptDate: "2026-08-10",
    });
  });

  it("offers no receipt for a customer who has never bought anything", async () => {
    stubServer(() => ({ found: true, hasSale: false, customerName: "Bilal" }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_2",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Bilal buy last time?");

    expect(outcome.receipt).toBeNull();
  });

  it("offers no receipt rather than a broken one when the sale cannot be identified", async () => {
    // A link built from a missing id would 404 on click. Answering without a
    // receipt is the smaller failure, so a partial result yields none.
    stubServer(() => ({ ...lastSale, saleId: undefined }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(outcome.answer).toContain("Ali's last sale was on 2026-08-10");
    expect(outcome.receipt).toBeNull();
  });

  it("handles a single-item sale", async () => {
    stubServer(() => ({
      ...lastSale,
      total: 600,
      items: [lastSale.items[0]],
    }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(outcome.answer).toBe(
      "Ali's last sale was on 2026-08-10: 2 kg of Rice at 300. That came to 600.",
    );
  });

  it("drops the trailing zeros on a fractional quantity", async () => {
    stubServer(() => ({
      ...lastSale,
      total: 375,
      items: [
        { productName: "Oil", unit: "litre", quantity: 1.5, unitPrice: 250, lineTotal: 375 },
      ],
    }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(outcome.answer).toContain("1.5 litre of Oil");
  });

  it("distinguishes a customer with no sales from one not on file", async () => {
    stubServer(() => ({ found: true, hasSale: false, customerName: "Bilal" }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_2",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Bilal buy last time?");

    expect(outcome.answer).toBe("I have no sales recorded for Bilal.");
  });

  it("reports a customer that is not on file", async () => {
    stubServer(() => ({ found: false, customerName: "Ali" }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_1",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Ali buy last time?");

    expect(outcome.answer).toBe("I don't have Ali on file.");
  });

  it("rejects a token the system never issued", async () => {
    stubServer(() => ({ found: false }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: "customer_99",
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did Zain buy last time?");

    expect(outcome.answer).toBe("I don't have that customer on file.");
    expect(call).not.toHaveBeenCalledWith(
      "query_last_sale_for_customer",
      expect.anything(),
    );
  });

  it("asks which customer when the model named none", async () => {
    stubServer(() => ({ found: false }));
    route.mockResolvedValue({
      tool: "last_sale_for_customer",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what did they buy last time?");

    expect(outcome.answer).toBe("Which customer did you mean?");
  });
});

describe("sales_by_product", () => {
  it("reports quantity and revenue", async () => {
    stubServer(() => ({
      found: true,
      productName: "Rice",
      quantity: 12,
      unit: "kg",
      revenue: 3600,
    }));
    route.mockResolvedValue({
      tool: "sales_by_product",
      customer: null,
      product: "rice",
      date: null,
    });

    const outcome = await answerQuery("how much rice have I sold?");

    expect(outcome.answer).toBe("You've sold 12 kg of Rice, for 3600.");
  });

  it("says when the product is not stocked", async () => {
    stubServer(() => ({ found: false }));
    route.mockResolvedValue({
      tool: "sales_by_product",
      customer: null,
      product: "caviar",
      date: null,
    });

    const outcome = await answerQuery("how much caviar have I sold?");

    expect(outcome.answer).toBe("caviar isn't in your catalogue.");
  });

  it("says when it is stocked but has never sold", async () => {
    stubServer(() => ({
      found: true,
      productName: "Flour",
      quantity: 0,
      unit: "kg",
      revenue: 0,
    }));
    route.mockResolvedValue({
      tool: "sales_by_product",
      customer: null,
      product: "flour",
      date: null,
    });

    const outcome = await answerQuery("how much flour have I sold?");

    expect(outcome.answer).toBe("You haven't sold any Flour yet.");
  });

  it("asks which product when the model named none", async () => {
    stubServer(() => ({ found: false }));
    route.mockResolvedValue({
      tool: "sales_by_product",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("how much of it have I sold?");

    expect(outcome.answer).toBe("Which product did you mean?");
  });
});

describe("questions this system cannot answer", () => {
  it("says what it can do rather than guessing", async () => {
    stubServer(() => ({}));
    route.mockResolvedValue({
      tool: "none",
      customer: null,
      product: null,
      date: null,
    });

    const outcome = await answerQuery("what's the weather?");

    expect(outcome.answer).toContain("I can answer four things");
    // No query tool was reached.
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe("plural", () => {
  it("does not pluralise one", () => {
    expect(plural(1, "sale")).toBe("1 sale");
  });

  it("pluralises everything else, including zero", () => {
    expect(plural(0, "sale")).toBe("0 sales");
    expect(plural(3, "purchase")).toBe("3 purchases");
  });
});
