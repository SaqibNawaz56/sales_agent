jest.mock("../../src/mcp", () => ({ callServerTool: jest.fn() }));

import { callServerTool } from "../../src/mcp";
import {
  buildPseudonymMap,
  containsRealName,
  detokenise,
  tokenise,
  type PseudonymMap,
} from "../../src/reporting/pseudonym";

const call = callServerTool as jest.MockedFunction<typeof callServerTool>;

function mapOf(customers: Array<{ id: number; name: string }>): PseudonymMap {
  const toReal = new Map<string, string>();
  const toToken = new Map<string, string>();
  for (const c of customers) {
    toReal.set(`customer_${c.id}`, c.name);
    toToken.set(c.name, `customer_${c.id}`);
  }
  return { toReal, toToken };
}

/**
 * The privacy boundary on the read path.
 *
 * The shop owns its customer list, so that list is the dictionary — no NER
 * model, no heuristics. These tests are what makes success criterion 15
 * checkable rather than asserted.
 */

describe("buildPseudonymMap", () => {
  it("builds the dictionary from the shop's own customer list", async () => {
    call.mockResolvedValue({
      customers: [
        { id: 1, name: "Ali" },
        { id: 2, name: "Bilal" },
      ],
    } as never);

    const map = await buildPseudonymMap();

    expect(call).toHaveBeenCalledWith("list_customers", {});
    expect(map.toToken.get("Ali")).toBe("customer_1");
    expect(map.toReal.get("customer_2")).toBe("Bilal");
  });

  it("handles a shop with no customers yet", async () => {
    call.mockResolvedValue({ customers: [] } as never);

    const map = await buildPseudonymMap();

    expect(map.toToken.size).toBe(0);
  });
});

describe("tokenise", () => {
  it("replaces a known name with its token", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(tokenise("how much has Ali bought?", map)).toBe(
      "how much has customer_1 bought?",
    );
  });

  it("replaces the longest name first", () => {
    // With both on file, replacing "Ali" first would turn "Ali Raza" into
    // "customer_1 Raza" and merge two different people.
    const map = mapOf([
      { id: 1, name: "Ali" },
      { id: 2, name: "Ali Raza" },
    ]);

    expect(tokenise("what did Ali Raza buy?", map)).toBe(
      "what did customer_2 buy?",
    );
  });

  it("still tokenises the shorter name when it stands alone", () => {
    const map = mapOf([
      { id: 1, name: "Ali" },
      { id: 2, name: "Ali Raza" },
    ]);

    expect(tokenise("what did Ali buy?", map)).toBe("what did customer_1 buy?");
  });

  it("matches regardless of case", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(tokenise("what did ALI buy?", map)).toBe(
      "what did customer_1 buy?",
    );
  });

  it("does not match a name inside a longer word", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(tokenise("how much Alifa did I sell?", map)).toBe(
      "how much Alifa did I sell?",
    );
  });

  it("treats a name containing regex characters as literal text", () => {
    // Unescaped, "A. Khan" would match "Ali Khan" too.
    const map = mapOf([{ id: 1, name: "A. Khan" }]);

    expect(tokenise("what did Ali Khan buy?", map)).toBe(
      "what did Ali Khan buy?",
    );
    expect(tokenise("what did A. Khan buy?", map)).toBe(
      "what did customer_1 buy?",
    );
  });

  it("replaces every occurrence, not only the first", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(tokenise("did Ali or Ali's brother buy?", map)).toContain(
      "customer_1 or customer_1",
    );
  });

  it("leaves a question naming nobody untouched", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(tokenise("what did I sell today?", map)).toBe(
      "what did I sell today?",
    );
  });
});

describe("detokenise", () => {
  it("maps a token back to the real name", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(detokenise("customer_1", map)).toBe("Ali");
  });

  it("leaves a token the system never issued alone", () => {
    // This is how answerSalesByCustomer detects a model-invented token.
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(detokenise("customer_99", map)).toBe("customer_99");
  });

  it("round-trips a question through both directions", () => {
    const map = mapOf([
      { id: 1, name: "Ali" },
      { id: 2, name: "Bilal" },
    ]);
    const question = "did Ali buy more than Bilal?";

    expect(detokenise(tokenise(question, map), map)).toBe(question);
  });
});

describe("containsRealName", () => {
  it("is true for text still carrying a customer name", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(containsRealName("how much has Ali bought?", map)).toBe(true);
  });

  it("is false for the tokenised form", () => {
    // Asserted against the exact string sent to Groq, rather than inferred
    // from the absence of a complaint.
    const map = mapOf([{ id: 1, name: "Ali" }]);
    const outbound = tokenise("how much has Ali bought?", map);

    expect(containsRealName(outbound, map)).toBe(false);
  });

  it("is false when the name only appears inside another word", () => {
    const map = mapOf([{ id: 1, name: "Ali" }]);

    expect(containsRealName("Alifa", map)).toBe(false);
  });
});
