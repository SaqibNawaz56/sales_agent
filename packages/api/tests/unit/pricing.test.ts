jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));
jest.mock("../../src/llm", () => ({ parsePriceAnswer: jest.fn() }));

import { parsePriceAnswer } from "../../src/llm";
import { callServerTool } from "../../src/mcp";
import { applyPriceChange, proposePriceChange } from "../../src/pricing";
import type { PendingPriceChange } from "../../src/pricing";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;
const price = parsePriceAnswer as jest.MockedFunction<typeof parsePriceAnswer>;

const RICE = { id: 1, name: "Rice", unit: "kg", currentPrice: 300 };

function pending(overrides: Partial<PendingPriceChange> = {}): PendingPriceChange {
  return {
    productId: 1,
    productName: "Rice",
    unit: "kg",
    currentPrice: 300,
    newPrice: 350,
    question: "Rice is 300 per kg. Change it up to 350?",
    choices: [
      { id: "yes", label: "Yes, 350", intent: "affirm" },
      { id: "no", label: "No, leave it", intent: "reject" },
    ],
    ...overrides,
  };
}

/**
 * Changing a catalogue price.
 *
 * Two properties matter here and they are separable. The figure must come from
 * the narrow price schema rather than from sale extraction — that is what keeps
 * R3 true by construction. And nothing may be written before a button is
 * pressed, which is what R2 asks of any write.
 */

describe("proposePriceChange", () => {
  it("proposes the change without writing anything", async () => {
    call.mockResolvedValue({ found: true, product: RICE } as never);
    price.mockResolvedValue({ price: 350, unit: null });

    const proposal = await proposePriceChange("rice", "change rice to 350");

    expect(proposal.pending).toMatchObject({
      productId: 1,
      productName: "Rice",
      currentPrice: 300,
      newPrice: 350,
    });
    // Looked the product up, and stopped there.
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalledWith(
      "update_product_price",
      expect.anything(),
    );
  });

  it("states both figures, so the movement can be checked", async () => {
    // "Change rice to 350" is impossible to sanity-check without being told
    // what it was.
    call.mockResolvedValue({ found: true, product: RICE } as never);
    price.mockResolvedValue({ price: 350, unit: null });

    const proposal = await proposePriceChange("rice", "change rice to 350");

    expect(proposal.pending?.question).toBe(
      "Rice is 300 per kg. Change it up to 350?",
    );
  });

  it("says 'down' for a reduction", async () => {
    call.mockResolvedValue({ found: true, product: RICE } as never);
    price.mockResolvedValue({ price: 250, unit: null });

    const proposal = await proposePriceChange("rice", "rice is 250 now");

    expect(proposal.pending?.question).toContain("Change it down to 250?");
  });

  it("reads the figure from the price schema, not from extraction", async () => {
    // The sale-extraction schema has no price field at all. This is the only
    // shape in the system allowed to carry money out of a model.
    call.mockResolvedValue({ found: true, product: RICE } as never);
    price.mockResolvedValue({ price: 350, unit: null });

    await proposePriceChange("rice", "change rice to 350");

    expect(price).toHaveBeenCalledWith(
      "What is the new price of Rice?",
      "change rice to 350",
    );
  });

  it("asks for the figure rather than inferring one", async () => {
    call.mockResolvedValue({ found: true, product: RICE } as never);
    price.mockResolvedValue({ price: null, unit: null });

    const proposal = await proposePriceChange("rice", "change the rice price");

    expect(proposal.pending).toBeNull();
    expect(proposal.reply).toBe("What's the new price of Rice per kg?");
  });

  it("asks which product when none was named", async () => {
    const proposal = await proposePriceChange(null, "change the price");

    expect(proposal.pending).toBeNull();
    expect(proposal.reply).toContain("Which product");
    expect(call).not.toHaveBeenCalled();
  });

  it("offers near matches for a product not in the catalogue", async () => {
    call.mockResolvedValue({
      found: false,
      suggestions: [{ id: 1, name: "Rice" }],
    } as never);

    const proposal = await proposePriceChange("rise", "change rise to 350");

    expect(proposal.pending).toBeNull();
    expect(proposal.reply).toBe(
      '"rise" isn\'t in your catalogue. Did you mean Rice?',
    );
  });

  it("does not propose a change to the price it already is", async () => {
    call.mockResolvedValue({ found: true, product: RICE } as never);
    price.mockResolvedValue({ price: 300, unit: null });

    const proposal = await proposePriceChange("rice", "change rice to 300");

    expect(proposal.pending).toBeNull();
    expect(proposal.reply).toBe("Rice is already 300 per kg.");
  });
});

describe("applyPriceChange", () => {
  it("writes the new price and reports both figures", async () => {
    call.mockResolvedValue({
      updated: true,
      product: {
        id: 1,
        name: "Rice",
        unit: "kg",
        previousPrice: 300,
        currentPrice: 350,
      },
    } as never);

    const reply = await applyPriceChange(pending());

    expect(call).toHaveBeenCalledWith("update_product_price", {
      productId: 1,
      price: 350,
    });
    expect(reply).toBe(
      "Rice is now 350 per kg, was 300. Past sales are unchanged.",
    );
  });

  it("says past sales are unchanged, because they are", async () => {
    // sale_items.unit_price_snapshot is untouched, so raising a price cannot
    // rewrite what an earlier sale charged (F7).
    call.mockResolvedValue({
      updated: true,
      product: {
        id: 1,
        name: "Rice",
        unit: "kg",
        previousPrice: 300,
        currentPrice: 350,
      },
    } as never);

    expect(await applyPriceChange(pending())).toContain(
      "Past sales are unchanged",
    );
  });

  it("reports a refusal rather than claiming success", async () => {
    call.mockResolvedValue({ updated: false, reason: "no such product" } as never);

    expect(await applyPriceChange(pending())).toBe(
      "The price was not changed: no such product.",
    );
  });

  it("survives an unreachable server", async () => {
    call.mockRejectedValue(new Error("MCP server unreachable"));

    expect(await applyPriceChange(pending())).toContain("MCP server unreachable");
  });
});
