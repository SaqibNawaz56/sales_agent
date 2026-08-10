jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));
jest.mock("../../src/llm", () => ({
  parseConfirmationAnswer: jest.fn(),
  parsePriceAnswer: jest.fn(),
  parseQuantityAnswer: jest.fn(),
}));

import { applyAnswer } from "../../src/clarification";
import { looksLikeQuantity } from "../../src/clarification/looks-like-quantity";
import {
  parseConfirmationAnswer,
  parsePriceAnswer,
  parseQuantityAnswer,
} from "../../src/llm";
import { callServerTool } from "../../src/mcp";
import {
  buildCustomerQuestion,
  buildPriceQuestion,
  buildQuantityQuestion,
  buildUnknownProductQuestion,
} from "../../src/questions";
import { draftWith, rawItem, resolvedItem, unknownItem } from "./helpers/fixtures";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;
const confirmation = parseConfirmationAnswer as jest.MockedFunction<
  typeof parseConfirmationAnswer
>;
const price = parsePriceAnswer as jest.MockedFunction<typeof parsePriceAnswer>;
const quantity = parseQuantityAnswer as jest.MockedFunction<
  typeof parseQuantityAnswer
>;

/**
 * Typed replies.
 *
 * The model is stubbed at the parser boundary, so these tests are about what
 * the controller does with an interpretation — never about whether the
 * interpretation was any good. That split is the architecture: language
 * understanding is the model's job, and every consequence of it is code's.
 */

describe("the dispatcher", () => {
  it("refuses a reply when no question is outstanding", async () => {
    const result = await applyAnswer(draftWith({ pending: null }), "yes");

    expect(result.understood).toBe(false);
    expect(confirmation).not.toHaveBeenCalled();
  });
});

describe("quantity answers", () => {
  it("writes the amount onto the item that was asked about, and no other", async () => {
    quantity.mockResolvedValue({ quantity: 2, unit: "litre" });

    const untouched = resolvedItem({ rawProduct: "rice", quantity: 2 });
    const asked = resolvedItem({
      rawProduct: "oil",
      quantity: null,
      rawUnit: null,
    });
    const draft = draftWith({ items: [untouched, asked] });
    draft.pending = buildQuantityQuestion(asked, 1);

    const result = await applyAnswer(draft, "2 litres");

    expect(result.understood).toBe(true);
    expect(asked.quantity).toBe(2);
    expect(asked.rawUnit).toBe("litre");
    expect(untouched.quantity).toBe(2);
    expect(draft.pending).toBeNull();
  });

  it("keeps the question standing when no amount was heard", async () => {
    // An invented quantity is the R1 failure mode and would be invisible on
    // the summary, so the gap stays open rather than being guessed past.
    quantity.mockResolvedValue({ quantity: null, unit: null });

    const item = resolvedItem({ quantity: null });
    const draft = draftWith({ items: [item] });
    draft.pending = buildQuantityQuestion(item, 0);

    const result = await applyAnswer(draft, "a fair bit");

    expect(result.understood).toBe(false);
    expect(item.quantity).toBeNull();
    expect(draft.pending).not.toBeNull();
  });

  it("does not overwrite a unit the owner already stated", async () => {
    quantity.mockResolvedValue({ quantity: 2, unit: "litre" });

    const item = resolvedItem({ quantity: null, rawUnit: "bottle" });
    const draft = draftWith({ items: [item] });
    draft.pending = buildQuantityQuestion(item, 0);

    await applyAnswer(draft, "2");

    expect(item.rawUnit).toBe("bottle");
  });
});

describe("unknown product answers", () => {
  it("adopts the suggestion on a yes", async () => {
    confirmation.mockResolvedValue({ decision: "yes", value: null });

    const item = unknownItem({
      rawProduct: "rise",
      suggestions: [{ id: 1, name: "Rice" }],
    });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyAnswer(draft, "yes");

    expect(result.understood).toBe(true);
    expect(item.rawProduct).toBe("Rice");
    expect(draft.pending).toBeNull();
  });

  it("adopts a different product name typed instead of an answer", async () => {
    confirmation.mockResolvedValue({ decision: "other", value: "Basmati" });

    const item = unknownItem({ rawProduct: "rise", suggestions: [] });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyAnswer(draft, "basmati actually");

    expect(result.understood).toBe(true);
    expect(item.rawProduct).toBe("Basmati");
  });

  it("does not mistake an amount for a product name", async () => {
    // "2 litres" in reply to "did you mean Cooking Oil?" would otherwise be
    // adopted as a name and put an item called "2 litres" into the sale.
    confirmation.mockResolvedValue({ decision: "other", value: "2 litres" });

    const item = unknownItem({ rawProduct: "oil", suggestions: [] });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyAnswer(draft, "2 litres");

    expect(result.understood).toBe(false);
    expect(item.rawProduct).toBe("oil");
  });

  it("opens the price sub-loop on a yes with no suggestions", async () => {
    confirmation.mockResolvedValue({ decision: "yes", value: null });

    const item = unknownItem({ rawProduct: "ghee", suggestions: [] });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyAnswer(draft, "yes add it");

    expect(result.understood).toBe(true);
    expect(draft.pending?.kind).toBe("new_product_price");
    expect(call).not.toHaveBeenCalled();
  });

  it("drops the item on a no", async () => {
    confirmation.mockResolvedValue({ decision: "no", value: null });

    const keep = resolvedItem({ rawProduct: "rice" });
    const drop = unknownItem({ rawProduct: "ghee", suggestions: [] });
    const draft = draftWith({ items: [keep, drop] });
    draft.pending = buildUnknownProductQuestion(drop, 1);

    const result = await applyAnswer(draft, "no");

    expect(result.understood).toBe(true);
    expect(draft.items).toEqual([keep]);
  });

  it("re-asks when the reply was neither", async () => {
    confirmation.mockResolvedValue({ decision: "other", value: null });

    const item = unknownItem({ suggestions: [] });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyAnswer(draft, "hmm");

    expect(result).toEqual({
      understood: false,
      note: "Sorry, was that a yes or a no?",
    });
    expect(draft.pending).not.toBeNull();
  });
});

describe("customer answers", () => {
  it("takes the suggestion on a yes without creating anything", async () => {
    confirmation.mockResolvedValue({ decision: "yes", value: null });

    const draft = draftWith({
      customerName: "Alee",
      customerSuggestions: [{ id: 4, name: "Ali" }],
    });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyAnswer(draft, "yes");

    expect(result.understood).toBe(true);
    expect(draft.customerId).toBe(4);
    expect(draft.customerName).toBe("Ali");
    expect(call).not.toHaveBeenCalled();
  });

  it("creates the customer on a yes to a genuinely new name", async () => {
    confirmation.mockResolvedValue({ decision: "yes", value: null });
    call.mockResolvedValue({
      found: false,
      created: true,
      customer: { id: 12, name: "Ali" },
    } as never);

    const draft = draftWith({ customerName: "Ali", customerSuggestions: [] });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyAnswer(draft, "yes");

    // The only place in the system that passes createIfMissing.
    expect(call).toHaveBeenCalledWith("find_or_create_customer", {
      name: "Ali",
      createIfMissing: true,
    });
    expect(result.understood).toBe(true);
    expect(draft.customerId).toBe(12);
  });

  it("takes a corrected name and sends it back through resolution", async () => {
    confirmation.mockResolvedValue({ decision: "other", value: "Bilal" });

    const draft = draftWith({
      customerName: "Ali",
      customerId: null,
      customerSuggestions: [{ id: 4, name: "Ali" }],
    });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyAnswer(draft, "no, Bilal");

    expect(result.understood).toBe(true);
    expect(draft.customerName).toBe("Bilal");
    expect(draft.customerId).toBeNull();
    expect(draft.customerSuggestions).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });

  it("does not accept an amount as a customer name", async () => {
    confirmation.mockResolvedValue({ decision: "other", value: "2kg" });

    const draft = draftWith({ customerName: "Ali" });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyAnswer(draft, "2kg");

    expect(result.understood).toBe(false);
    expect(draft.customerName).toBe("Ali");
  });
});

describe("the new-product sub-loop", () => {
  it("creates the product and refills the item from the catalogue", async () => {
    price.mockResolvedValue({ price: 500, unit: "kg" });
    call.mockResolvedValue({
      created: true,
      product: { id: 9, name: "Ghee", unit: "kg", currentPrice: 500 },
    } as never);

    const item = rawItem("ghee", 1, "kg");
    const draft = draftWith({ items: [item] });
    draft.pending = buildPriceQuestion(item, 0);

    const result = await applyAnswer(draft, "500");

    expect(call).toHaveBeenCalledWith("create_product", {
      name: "ghee",
      unit: "kg",
      price: 500,
    });
    expect(result.understood).toBe(true);

    // Refilled from what the catalogue now holds, not from what was typed, so
    // the item rejoins the same path as every other product.
    expect(item.productId).toBe(9);
    expect(item.productName).toBe("Ghee");
    expect(item.unitPrice).toBe(500);
    expect(draft.pending).toBeNull();
  });

  it("never infers a missing price", async () => {
    // The single entry point for pricing data. A guess here would poison every
    // future sale of this product, not just this one.
    price.mockResolvedValue({ price: null, unit: "kg" });

    const item = rawItem("ghee", 1, "kg");
    const draft = draftWith({ items: [item] });
    draft.pending = buildPriceQuestion(item, 0);

    const result = await applyAnswer(draft, "not sure");

    expect(result.understood).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it("keeps the price and asks only for the unit still missing", async () => {
    price.mockResolvedValue({ price: 500, unit: null });

    const item = rawItem("ghee", 1, null);
    const draft = draftWith({ items: [item] });
    draft.pending = buildPriceQuestion(item, 0);

    const result = await applyAnswer(draft, "500");

    expect(result.understood).toBe(true);
    expect(draft.pending?.kind).toBe("new_product_price");
    expect(draft.pending?.question).toContain("500");
    // Carried forward so he does not have to restate it.
    expect(
      (draft.pending as { priceSoFar?: number }).priceSoFar,
    ).toBe(500);
    expect(call).not.toHaveBeenCalled();
  });

  it("completes using the price carried from the previous turn", async () => {
    price.mockResolvedValue({ price: null, unit: "kg" });
    call.mockResolvedValue({
      created: true,
      product: { id: 9, name: "Ghee", unit: "kg", currentPrice: 500 },
    } as never);

    const item = rawItem("ghee", 1, null);
    const draft = draftWith({ items: [item] });
    draft.pending = {
      kind: "new_product_price",
      itemIndex: 0,
      question: "Got 500. And ghee is sold per what unit — kg, litre, packet?",
      choices: [],
      priceSoFar: 500,
    };

    const result = await applyAnswer(draft, "kg");

    expect(call).toHaveBeenCalledWith("create_product", {
      name: "ghee",
      unit: "kg",
      price: 500,
    });
    expect(result.understood).toBe(true);
  });

  it("reports a failed creation rather than pricing the item anyway", async () => {
    price.mockResolvedValue({ price: 500, unit: "kg" });
    call.mockResolvedValue({ created: false } as never);

    const item = rawItem("ghee", 1, "kg");
    const draft = draftWith({ items: [item] });
    draft.pending = buildPriceQuestion(item, 0);

    const result = await applyAnswer(draft, "500");

    expect(result.understood).toBe(false);
    expect(item.unitPrice).toBeNull();
  });
});

describe("looksLikeQuantity", () => {
  it.each(["2", "2kg", "2 litres", "1.5", "  3 packets ", ""])(
    "treats %p as an amount, not a name",
    (value) => {
      expect(looksLikeQuantity(value)).toBe(true);
    },
  );

  it.each(["Ali", "Basmati Rice", "Ghee", "Ali Raza"])(
    "treats %p as a name",
    (value) => {
      expect(looksLikeQuantity(value)).toBe(false);
    },
  );
});
