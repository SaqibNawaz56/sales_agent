jest.mock("../../src/mcp/load-all-tools", () => ({ loadAllTools: jest.fn() }));

import type { StructuredToolInterface } from "@langchain/core/tools";

import { AGENT_TOOL_ALLOWLIST } from "../../src/mcp/agent-tool-allowlist";
import { bareName } from "../../src/mcp/bare-name";
import { loadAgentTools } from "../../src/mcp/load-agent-tools";
import { loadAllTools } from "../../src/mcp/load-all-tools";

const all = loadAllTools as jest.MockedFunction<typeof loadAllTools>;

/** Just enough of a LangChain tool to be filtered. */
function tool(name: string): StructuredToolInterface {
  return { name } as StructuredToolInterface;
}

/**
 * The security boundary, tested as a boundary.
 *
 * Imports come from the individual files rather than the barrel on purpose:
 * every other unit suite mocks src/mcp wholesale, and mocking the module that
 * contains the allowlist would make this file assert its own stub.
 */

describe("AGENT_TOOL_ALLOWLIST", () => {
  it("does not contain save_sale", () => {
    // The single most important line in the test suite. The model is not told
    // this tool exists, so it cannot request it (R7).
    expect(AGENT_TOOL_ALLOWLIST.has("save_sale")).toBe(false);
  });

  it("does not contain the tools that carry prices or the customer list", () => {
    // Controller-only by design: no catalogue fact and no price passes through
    // the model, which makes R3 true by construction.
    for (const name of [
      "lookup_product",
      "create_product",
      "find_or_create_customer",
      "list_customers",
      // Carries a real customer name and the exact prices they were charged.
      // Exposing it would undo the pseudonymisation the read path provides.
      "get_sale_receipt",
    ]) {
      expect(AGENT_TOOL_ALLOWLIST.has(name)).toBe(false);
    }
  });

  it("contains only names that were deliberately added", () => {
    // An allowlist fails closed: a tool added to the MCP server later is
    // invisible until someone names it here. Pinning the exact set means
    // widening it has to be a deliberate edit to this assertion too.
    expect([...AGENT_TOOL_ALLOWLIST].sort()).toEqual(["health_check"]);
  });
});

describe("bareName", () => {
  it("strips the adapter's server namespace", () => {
    expect(bareName("sales__save_sale")).toBe("save_sale");
  });

  it("leaves an un-namespaced name alone", () => {
    expect(bareName("save_sale")).toBe("save_sale");
  });

  it("splits on the last separator, not the first", () => {
    expect(bareName("sales__inner__query_daily_total")).toBe(
      "query_daily_total",
    );
  });
});

describe("loadAgentTools", () => {
  it("filters the server's full tool list down to the allowlist", async () => {
    all.mockResolvedValue([
      tool("sales__health_check"),
      tool("sales__save_sale"),
      tool("sales__lookup_product"),
      tool("sales__find_or_create_customer"),
    ]);

    const exposed = await loadAgentTools();

    expect(exposed.map((t) => t.name)).toEqual(["sales__health_check"]);
  });

  it("hides a newly added write tool nobody remembered to exclude", async () => {
    // The denylist failure mode, checked directly: this is what "fails closed"
    // has to mean in practice.
    all.mockResolvedValue([
      tool("sales__health_check"),
      tool("sales__delete_sale"),
      tool("sales__adjust_price"),
    ]);

    const exposed = await loadAgentTools();

    expect(exposed.map((t) => t.name)).toEqual(["sales__health_check"]);
  });

  it("exposes nothing when the server exposes nothing it recognises", async () => {
    all.mockResolvedValue([tool("sales__save_sale")]);

    expect(await loadAgentTools()).toEqual([]);
  });
});
