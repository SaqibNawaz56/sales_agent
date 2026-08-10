import {
  answerSchema,
  chatSchema,
  confirmSchema,
  saleIdParamSchema,
} from "../../src/http/request.schemas";
import { presentDraft, presentQuestion } from "../../src/http/present";
import { buildCustomerQuestion } from "../../src/questions";
import { completeDraft, draftWith, rawItem, resolvedItem } from "./helpers/fixtures";

/**
 * The HTTP edge: what crosses the wire in each direction.
 *
 * The request schemas are the interesting half. Nest's ValidationPipe reads
 * metadata that esbuild does not emit, so under `tsx watch` a DTO class
 * validates nothing and silently passes the raw body through — which is how a
 * string "true" once reached the confirm branch. These assertions are what
 * makes that regression impossible to reintroduce quietly.
 */

describe("presentDraft", () => {
  it("is null for no draft", () => {
    expect(presentDraft(null)).toBeNull();
  });

  it("derives the client's shape rather than exposing the draft", () => {
    const draft = completeDraft({
      items: [resolvedItem({ productName: "Rice", quantity: 2, unitPrice: 300 })],
    });

    expect(presentDraft(draft)).toEqual({
      customer: "Ali",
      status: "building",
      items: [
        {
          product: "Rice",
          quantity: 2,
          unit: "kg",
          unitPrice: 300,
          lineTotal: 600,
        },
      ],
      grandTotal: 600,
    });
  });

  it("leaks nothing incidental from the draft", () => {
    const presented = presentDraft(completeDraft());

    // No customerId, no suggestions, no pending question, no original message.
    expect(Object.keys(presented as object).sort()).toEqual([
      "customer",
      "grandTotal",
      "items",
      "status",
    ]);
  });

  it("falls back to the owner's word for an unresolved product", () => {
    const draft = draftWith({ items: [rawItem("ghee", 1, "kg")] });

    expect(presentDraft(draft)?.items[0].product).toBe("ghee");
  });

  it("reports a null grand total rather than a partial one", () => {
    const draft = draftWith({
      items: [resolvedItem(), rawItem("oil", null, null)],
    });

    expect(presentDraft(draft)?.grandTotal).toBeNull();
  });
});

describe("presentQuestion", () => {
  it("is null when nothing is outstanding", () => {
    expect(presentQuestion(null)).toBeNull();
    expect(presentQuestion(completeDraft())).toBeNull();
  });

  it("sends only the id, label and intent of each choice", () => {
    const draft = draftWith({ customerName: "Ali" });
    draft.pending = buildCustomerQuestion(draft);

    expect(presentQuestion(draft)).toEqual({
      text: '"Ali" is a new customer. Add them?',
      choices: [
        { id: "yes", label: "Add customer", intent: "affirm" },
        { id: "no", label: "No, different name", intent: "reject" },
      ],
    });
  });

  it("sends empty choices for a question that wants typing", () => {
    // How the client knows to show the composer instead of buttons.
    const draft = draftWith({ items: [resolvedItem({ quantity: null })] });
    draft.pending = {
      kind: "missing_quantity",
      itemIndex: 0,
      question: "How much rice?",
      choices: [],
    };

    expect(presentQuestion(draft)?.choices).toEqual([]);
  });
});

describe("chatSchema", () => {
  it("accepts a well-formed body", () => {
    expect(
      chatSchema.parse({ sessionId: "s1", message: "2kg rice to Ali" }),
    ).toEqual({ sessionId: "s1", message: "2kg rice to Ali" });
  });

  it("trims the message", () => {
    expect(chatSchema.parse({ sessionId: "s1", message: "  hi  " }).message).toBe(
      "hi",
    );
  });

  it("rejects an empty session id", () => {
    expect(chatSchema.safeParse({ sessionId: "", message: "hi" }).success).toBe(
      false,
    );
  });

  it("rejects a message that is only whitespace", () => {
    expect(
      chatSchema.safeParse({ sessionId: "s1", message: "   " }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      chatSchema.safeParse({ sessionId: "s1", message: "hi", admin: true })
        .success,
    ).toBe(false);
  });
});

describe("confirmSchema", () => {
  it("accepts an explicit true and an explicit false", () => {
    expect(confirmSchema.parse({ sessionId: "s1", confirmed: true }).confirmed)
      .toBe(true);
    expect(confirmSchema.parse({ sessionId: "s1", confirmed: false }).confirmed)
      .toBe(false);
  });

  it("rejects a missing flag", () => {
    // A missing flag must never be read as consent to write.
    expect(confirmSchema.safeParse({ sessionId: "s1" }).success).toBe(false);
  });

  it.each(["true", 1, "yes", null])(
    "rejects %p, which is not a boolean",
    (confirmed) => {
      expect(
        confirmSchema.safeParse({ sessionId: "s1", confirmed }).success,
      ).toBe(false);
    },
  );
});

describe("saleIdParamSchema", () => {
  it("coerces the path string to a number", () => {
    // A path parameter is always a string; the receipt lookup needs an integer.
    expect(saleIdParamSchema.parse({ id: "46" })).toEqual({ id: 46 });
  });

  it.each(["abc", "", "1.5", "0", "-3", "1e5abc"])(
    "rejects %p",
    (id) => {
      expect(saleIdParamSchema.safeParse({ id }).success).toBe(false);
    },
  );
});

describe("answerSchema", () => {
  it("accepts any non-empty choice id", () => {
    // The handler refuses ids that were not offered, so nothing here needs to
    // enumerate valid values.
    expect(
      answerSchema.parse({ sessionId: "s1", choiceId: "suggestion:7" }).choiceId,
    ).toBe("suggestion:7");
  });

  it("rejects an empty choice id", () => {
    expect(
      answerSchema.safeParse({ sessionId: "s1", choiceId: "" }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      answerSchema.safeParse({ sessionId: "s1", choiceId: "yes", force: true })
        .success,
    ).toBe(false);
  });
});
