jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));
jest.mock("../../src/llm", () => ({
  parseConfirmationAnswer: jest.fn(),
  parsePriceAnswer: jest.fn(),
  parseQuantityAnswer: jest.fn(),
}));

import { applyChoice } from "../../src/clarification";
import type { CustomerQuestion, UnknownProductQuestion } from "../../src/draft";
import * as llm from "../../src/llm";
import { callServerTool } from "../../src/mcp";
import {
  CHOICE_NEW,
  CHOICE_NO,
  CHOICE_YES,
  buildCustomerQuestion,
  buildUnknownProductQuestion,
} from "../../src/questions";
import { draftWith, rawItem, resolvedItem, unknownItem } from "./helpers/fixtures";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;

/**
 * Pressed answer buttons.
 *
 * The property this file exists to protect is the absence of a model call.
 * Two of these branches end in a database write — creating a customer, and
 * opening the sub-loop that creates a product — and R2 asks for those to be an
 * explicit confirmed action. A press already is one; interpreting it would put
 * a classifier back in front of a write.
 */

afterEach(() => {
  expect(llm.parseConfirmationAnswer).not.toHaveBeenCalled();
  expect(llm.parsePriceAnswer).not.toHaveBeenCalled();
  expect(llm.parseQuantityAnswer).not.toHaveBeenCalled();
});

describe("the guard", () => {
  it("refuses a press when no question is outstanding", async () => {
    const draft = draftWith({ pending: null });

    const result = await applyChoice(draft, CHOICE_YES);

    expect(result.understood).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses an id that was not among the choices offered", async () => {
    // Fails closed. A stale button from a previous turn, or an id a client
    // invented, is refused rather than acted on.
    const draft = draftWith({ customerName: "Ali" });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyChoice(draft, "suggestion:999");

    expect(result).toEqual({
      understood: false,
      note: "That option isn't available any more.",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses any press on a question that issued no buttons", async () => {
    // A quantity question wants typing. There is no id it could have offered.
    const draft = draftWith({ items: [resolvedItem({ quantity: null })] });
    draft.pending = {
      kind: "missing_quantity",
      itemIndex: 0,
      question: "How much rice?",
      choices: [],
    };

    const result = await applyChoice(draft, CHOICE_YES);

    expect(result.understood).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("customer choices", () => {
  it("adopts a pressed suggestion without touching the database", async () => {
    const draft = draftWith({
      customerName: "Sakib",
      customerSuggestions: [
        { id: 3, name: "saqib" },
        { id: 4, name: "Ali" },
      ],
    });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyChoice(draft, "suggestion:4");

    // The suggestion already carries a real id, so there is nothing to look up.
    expect(result.understood).toBe(true);
    expect(draft.customerId).toBe(4);
    expect(draft.customerName).toBe("Ali");
    expect(draft.customerSuggestions).toEqual([]);
    expect(draft.pending).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it("presses the second suggestion, not merely the first", async () => {
    // The regression this guards: the old handler took suggestions[0] for any
    // agreement, so pressing "Ali" silently selected "saqib".
    const draft = draftWith({
      customerName: "Sakib",
      customerSuggestions: [
        { id: 3, name: "saqib" },
        { id: 4, name: "Ali" },
      ],
    });
    draft.pending = buildCustomerQuestion(draft);

    await applyChoice(draft, "suggestion:4");

    expect(draft.customerName).toBe("Ali");
  });

  it("creates the customer only when the add button is pressed", async () => {
    call.mockResolvedValue({
      found: false,
      created: true,
      customer: { id: 12, name: "Ali" },
    } as never);

    const draft = draftWith({ customerName: "Ali" });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyChoice(draft, CHOICE_YES);

    expect(call).toHaveBeenCalledWith("find_or_create_customer", {
      name: "Ali",
      createIfMissing: true,
    });
    expect(result).toEqual({ understood: true, note: "Added Ali." });
    expect(draft.customerId).toBe(12);
    expect(draft.pending).toBeNull();
  });

  it("adopts the catalogue's spelling of the name it created", async () => {
    call.mockResolvedValue({
      found: false,
      created: true,
      customer: { id: 12, name: "Ali Raza" },
    } as never);

    const draft = draftWith({ customerName: "ali raza" });
    draft.pending = buildCustomerQuestion(draft);

    await applyChoice(draft, CHOICE_YES);

    expect(draft.customerName).toBe("Ali Raza");
  });

  it("reports a failed creation rather than proceeding without an id", async () => {
    call.mockResolvedValue({ found: false, created: false } as never);

    const draft = draftWith({ customerName: "Ali" });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyChoice(draft, CHOICE_YES);

    expect(result.understood).toBe(false);
    expect(draft.customerId).toBeNull();
  });

  it("clears the name on refusal so the next turn asks who it was for", async () => {
    const draft = draftWith({ customerName: "Ali" });
    draft.pending = buildCustomerQuestion(draft);

    const result = await applyChoice(draft, CHOICE_NO);

    expect(result.understood).toBe(true);
    expect(draft.customerName).toBeNull();
    expect(draft.customerId).toBeNull();
    expect(draft.pending).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses to create when there is no name to create", async () => {
    // Defensive: the builder issues no buttons in this state, so this is only
    // reachable by a hand-forged request.
    const draft = draftWith({ customerName: null });
    draft.pending = {
      kind: "customer",
      itemIndex: null,
      question: "Who was this sale for?",
      choices: [{ id: CHOICE_YES, label: "Add customer", intent: "affirm" }],
    } satisfies CustomerQuestion;

    const result = await applyChoice(draft, CHOICE_YES);

    expect(result.understood).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("product choices", () => {
  it("adopts a pressed suggestion and lets resolution price it", async () => {
    const item = unknownItem({
      rawProduct: "rise",
      suggestions: [{ id: 1, name: "Rice" }],
    });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyChoice(draft, "suggestion:1");

    expect(result.understood).toBe(true);
    expect(item.rawProduct).toBe("Rice");
    expect(item.suggestions).toEqual([]);
    expect(draft.pending).toBeNull();
    // Deliberately still unpriced: the item rejoins the normal resolution path
    // rather than having a price written here.
    expect(item.unitPrice).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it("opens the price sub-loop when the owner agrees to add it", async () => {
    const item = unknownItem({ rawProduct: "ghee", suggestions: [] });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    const result = await applyChoice(draft, CHOICE_YES);

    expect(result.understood).toBe(true);
    expect(draft.pending?.kind).toBe("new_product_price");
    expect(draft.pending?.itemIndex).toBe(0);
    // Nothing is created yet — the product row waits on a price.
    expect(call).not.toHaveBeenCalled();
  });

  it("treats 'add what I said' as the add branch, not as a suggestion", async () => {
    const item = unknownItem({
      rawProduct: "ghee",
      suggestions: [{ id: 1, name: "Ghee Tin" }],
    });
    const draft = draftWith({ items: [item] });
    draft.pending = buildUnknownProductQuestion(item, 0);

    await applyChoice(draft, CHOICE_NEW);

    expect(draft.pending?.kind).toBe("new_product_price");
    expect(item.rawProduct).toBe("ghee");
  });

  it("drops the item when the owner leaves it out, keeping the rest", async () => {
    const keep = resolvedItem({ rawProduct: "rice" });
    const drop = unknownItem({ rawProduct: "ghee", suggestions: [] });
    const draft = draftWith({ items: [keep, drop] });
    draft.pending = buildUnknownProductQuestion(drop, 1);

    const result = await applyChoice(draft, CHOICE_NO);

    expect(result).toEqual({ understood: true, note: "Left that item out." });
    expect(draft.items).toEqual([keep]);
    expect(draft.pending).toBeNull();
  });

  it("reports a suggestion that is no longer on the item", async () => {
    const item = rawItem("rise", 2, "kg");
    const draft = draftWith({ items: [item] });
    draft.pending = {
      kind: "unknown_product",
      itemIndex: 0,
      question: 'Did you mean Rice?',
      choices: [{ id: "suggestion:1", label: "Rice", intent: "neutral" }],
    } satisfies UnknownProductQuestion;

    const result = await applyChoice(draft, "suggestion:1");

    expect(result.understood).toBe(false);
    expect(item.rawProduct).toBe("rise");
  });
});
