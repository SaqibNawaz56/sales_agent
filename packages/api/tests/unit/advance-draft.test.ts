jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));

import { callServerTool } from "../../src/mcp";
import { advanceDraft } from "../../src/sales/advance-draft";
import { CONFIRM_PROMPT } from "../../src/sales/sales.types";
import {
  completeDraft,
  draftWith,
  rawItem,
  resolvedItem,
} from "./helpers/fixtures";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;

/**
 * The single decision point of the write path.
 *
 * Resolution and the checklist are real here; only the database is stubbed.
 * That is deliberate — the property under test is that what advanceDraft does
 * is a consequence of the draft alone, so the test states a draft and asserts a
 * turn, exactly as the function does.
 */

describe("the new-product short circuit", () => {
  it("re-asks the sub-loop question without running resolution", async () => {
    // The checklist knows nothing about the sub-loop. Left to it, it would see
    // an unknown product and ask "add it?" again, losing the yes just given.
    const item = rawItem("ghee", 1, "kg");
    const draft = draftWith({ items: [item] });
    draft.pending = {
      kind: "new_product_price",
      itemIndex: 0,
      question: "What's the price of ghee per kg?",
      choices: [],
    };

    const result = await advanceDraft(draft);

    expect(result.question).toBe("What's the price of ghee per kg?");
    expect(result.awaitingConfirmation).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("when a gap remains", () => {
  it("resolves against the catalogue, then asks about the first gap", async () => {
    call.mockImplementation(async (tool) => {
      if (tool === "lookup_product") {
        return {
          found: true,
          product: { id: 1, name: "Rice", unit: "kg", currentPrice: 300 },
        } as never;
      }
      return { found: false, created: false, suggestions: [] } as never;
    });

    const draft = draftWith({
      customerName: "Ali",
      items: [rawItem("rice", 2, "kg")],
    });

    const result = await advanceDraft(draft);

    // The price came from the catalogue, not from anything a model produced.
    expect(draft.items[0].unitPrice).toBe(300);
    expect(draft.status).toBe("building");
    expect(result.awaitingConfirmation).toBe(false);
    expect(result.question).toBe('"Ali" is a new customer. Add them?');
  });

  it("asks exactly one question even when several gaps exist", async () => {
    const draft = draftWith({
      items: [
        resolvedItem({ rawProduct: "oil", quantity: null }),
        resolvedItem({ rawProduct: "sugar", quantity: null }),
      ],
    });

    const result = await advanceDraft(draft);

    expect(result.question).toBe("How much oil (in kg)?");
    expect(draft.pending?.itemIndex).toBe(0);
  });

  it("stores the question on the draft so the next message answers it", async () => {
    const draft = draftWith({
      items: [resolvedItem({ quantity: null })],
    });

    await advanceDraft(draft);

    expect(draft.pending).not.toBeNull();
    expect(draft.pending?.kind).toBe("missing_quantity");
  });
});

describe("when the draft is complete", () => {
  it("presents the summary and opens the confirmation gate", async () => {
    const draft = completeDraft();

    const result = await advanceDraft(draft);

    expect(draft.status).toBe("awaiting_confirmation");
    expect(draft.pending).toBeNull();
    expect(result.awaitingConfirmation).toBe(true);
    expect(result.question).toBeNull();
    expect(result.reply).toContain("Sale to Ali");
    expect(result.reply).toContain(CONFIRM_PROMPT);
  });

  it("needs no database call when everything is already resolved", async () => {
    await advanceDraft(completeDraft());

    expect(call).not.toHaveBeenCalled();
  });

  it("shows the figures actually about to be written", async () => {
    // R1's mitigation: the summary is the owner's chance to catch a misparse,
    // so it must show the real quantities and prices, not a restatement.
    const draft = completeDraft({
      items: [
        resolvedItem({ productName: "Rice", quantity: 2, unitPrice: 300 }),
        resolvedItem({ productName: "Sugar", quantity: 2, unitPrice: 100 }),
      ],
    });

    const result = await advanceDraft(draft);

    expect(result.reply).toContain("800");
  });
});
