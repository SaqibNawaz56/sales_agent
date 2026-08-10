import {
  CHOICE_NEW,
  CHOICE_NO,
  CHOICE_YES,
  buildCustomerQuestion,
  buildPriceQuestion,
  buildQuantityQuestion,
  buildQuestion,
  buildUnknownProductQuestion,
  formatList,
  parseSuggestionChoiceId,
  suggestionChoiceId,
} from "../../src/questions";
import { draftWith, rawItem, resolvedItem, unknownItem } from "./helpers/fixtures";

/**
 * The question templates.
 *
 * These are deterministic on purpose — a model is never asked to phrase them —
 * so their wording is a fact about the system and can be asserted exactly.
 */

describe("formatList", () => {
  it("renders one name alone", () => {
    expect(formatList(["Rice"])).toBe("Rice");
  });

  it("joins two with 'or'", () => {
    expect(formatList(["Rice", "Sugar"])).toBe("Rice or Sugar");
  });

  it("comma-separates all but the last", () => {
    expect(formatList(["Rice", "Sugar", "Flour"])).toBe("Rice, Sugar or Flour");
  });
});

describe("choice ids", () => {
  it("round-trips a suggestion id", () => {
    expect(parseSuggestionChoiceId(suggestionChoiceId(7))).toBe(7);
  });

  it("returns null for the plain ids, which are not suggestions", () => {
    expect(parseSuggestionChoiceId(CHOICE_YES)).toBeNull();
    expect(parseSuggestionChoiceId(CHOICE_NO)).toBeNull();
    expect(parseSuggestionChoiceId(CHOICE_NEW)).toBeNull();
  });

  it("returns null for a suggestion id that is not a number", () => {
    expect(parseSuggestionChoiceId("suggestion:tampered")).toBeNull();
  });

  it("keeps ids readable in the tool log", () => {
    // Meaningful strings rather than opaque handles, so a request can be read.
    expect(suggestionChoiceId(7)).toBe("suggestion:7");
  });
});

describe("buildQuantityQuestion", () => {
  it("uses the owner's word for the product, not the catalogue's", () => {
    // He said "oil"; the catalogue calls it "Cooking Oil". Echoing his own
    // word back is what makes the question feel like a reply.
    const item = resolvedItem({
      rawProduct: "oil",
      productName: "Cooking Oil",
      quantity: null,
      unit: "litre",
    });

    expect(buildQuantityQuestion(item, 0).question).toBe(
      "How much oil (in litre)?",
    );
  });

  it("omits the unit hint when the catalogue has not supplied one", () => {
    const item = rawItem("oil", null, null);

    expect(buildQuantityQuestion(item, 0).question).toBe("How much oil?");
  });

  it("offers no buttons, because an amount is not a choice from a list", () => {
    expect(buildQuantityQuestion(rawItem("oil", null, null), 0).choices).toEqual(
      [],
    );
  });

  it("carries the index of the item it is about", () => {
    expect(buildQuantityQuestion(rawItem(), 2).itemIndex).toBe(2);
  });
});

describe("buildUnknownProductQuestion", () => {
  it("offers the near matches the catalogue returned", () => {
    const item = unknownItem({
      rawProduct: "rise",
      suggestions: [
        { id: 1, name: "Rice" },
        { id: 2, name: "Rice Flour" },
      ],
    });
    const question = buildUnknownProductQuestion(item, 0);

    expect(question.question).toBe(
      'I don\'t have "rise" in your catalogue. Did you mean Rice or Rice Flour?',
    );
    expect(question.choices.map((c) => c.id)).toEqual([
      "suggestion:1",
      "suggestion:2",
      CHOICE_NEW,
      CHOICE_NO,
    ]);
  });

  it("offers to add the product when there are no near matches", () => {
    const item = unknownItem({ rawProduct: "ghee", suggestions: [] });
    const question = buildUnknownProductQuestion(item, 0);

    expect(question.question).toBe(
      '"ghee" isn\'t in your catalogue. Do you want to add it?',
    );
    expect(question.choices.map((c) => c.id)).toEqual([CHOICE_YES, CHOICE_NO]);
  });

  it("always carries buttons, because agreeing eventually writes a product row", () => {
    const withSuggestions = buildUnknownProductQuestion(unknownItem(), 0);
    const without = buildUnknownProductQuestion(
      unknownItem({ suggestions: [] }),
      0,
    );

    expect(withSuggestions.choices.length).toBeGreaterThan(0);
    expect(without.choices.length).toBeGreaterThan(0);
  });
});

describe("buildCustomerQuestion", () => {
  it("asks openly when no name was extracted", () => {
    const question = buildCustomerQuestion(draftWith());

    expect(question.question).toBe("Who was this sale for?");
    // Nothing to offer: there is no name yet to accept or reject.
    expect(question.choices).toEqual([]);
  });

  it("offers one button per near match rather than a bare yes", () => {
    // "Yes" to "did you mean saqib or Ali?" cannot say which one was meant.
    // Before these buttons existed the handler silently took the first.
    const draft = draftWith({
      customerName: "Sakib",
      customerSuggestions: [
        { id: 3, name: "saqib" },
        { id: 4, name: "Ali" },
      ],
    });
    const question = buildCustomerQuestion(draft);

    expect(question.question).toBe(
      'I don\'t have "Sakib" on file. Did you mean saqib or Ali?',
    );
    expect(question.choices.map((c) => c.id)).toEqual([
      "suggestion:3",
      "suggestion:4",
      CHOICE_NEW,
    ]);
  });

  it("asks to add an entirely new name", () => {
    const draft = draftWith({ customerName: "Ali", customerSuggestions: [] });
    const question = buildCustomerQuestion(draft);

    expect(question.question).toBe('"Ali" is a new customer. Add them?');
    expect(question.choices.map((c) => c.id)).toEqual([CHOICE_YES, CHOICE_NO]);
  });
});

describe("buildPriceQuestion", () => {
  it("asks for the price alone when the owner already said a unit", () => {
    const item = rawItem("ghee", 1, "kg");

    expect(buildPriceQuestion(item, 0).question).toBe(
      "What's the price of ghee per kg?",
    );
  });

  it("asks for the unit alongside the price when he did not", () => {
    // One turn instead of two, and the two answers cannot be confused.
    const item = rawItem("ghee", 1, null);

    expect(buildPriceQuestion(item, 0).question).toBe(
      "What's the price of ghee, and per what unit (kg, litre, packet)?",
    );
  });

  it("offers no buttons, because offering a price would be inventing one", () => {
    expect(buildPriceQuestion(rawItem("ghee", 1, "kg"), 0).choices).toEqual([]);
  });
});

describe("buildQuestion", () => {
  it("dispatches a customer gap to the customer template", () => {
    const draft = draftWith({ customerName: "Ali" });
    const question = buildQuestion(draft, { kind: "customer", itemIndex: null });

    expect(question.kind).toBe("customer");
  });

  it("dispatches a quantity gap to the item it names", () => {
    const draft = draftWith({
      items: [resolvedItem(), resolvedItem({ rawProduct: "oil", quantity: null })],
    });
    const question = buildQuestion(draft, {
      kind: "missing_quantity",
      itemIndex: 1,
    });

    expect(question.kind).toBe("missing_quantity");
    expect(question.itemIndex).toBe(1);
    expect(question.question).toContain("oil");
  });

  it("dispatches an unknown product to the product template", () => {
    const draft = draftWith({ items: [unknownItem()] });
    const question = buildQuestion(draft, {
      kind: "unknown_product",
      itemIndex: 0,
    });

    expect(question.kind).toBe("unknown_product");
  });
});
