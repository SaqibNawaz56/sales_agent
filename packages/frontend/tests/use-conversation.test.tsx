jest.mock("../src/api", () => ({
  answerQuestion: jest.fn(),
  resolveSale: jest.fn(),
  sendMessage: jest.fn(),
}));

import { act, renderHook, waitFor } from "@testing-library/react";

import { answerQuestion, resolveSale, sendMessage } from "../src/api";
import type { ChatResponse } from "../src/api/api.types";
import { GREETING, SALE_READY } from "../src/constants/copy";
import { useConversation } from "../src/hooks/use-conversation";

const send = sendMessage as jest.MockedFunction<typeof sendMessage>;
const answer = answerQuestion as jest.MockedFunction<typeof answerQuestion>;
const resolve = resolveSale as jest.MockedFunction<typeof resolveSale>;

const DRAFT = {
  customer: "Ali",
  status: "awaiting_confirmation" as const,
  items: [
    { product: "Rice", quantity: 2, unit: "kg", unitPrice: 300, lineTotal: 600 },
  ],
  grandTotal: 600,
};

function turn(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    reply: "ok",
    draftSale: null,
    question: null,
    awaitingConfirmation: false,
    ...overrides,
  };
}

/**
 * All conversation state, and the three things that can change it.
 *
 * The property worth protecting is that `resolve` is the only path to a write
 * and it takes `confirmed` as a required argument — there is no route through
 * this hook that reaches the confirm endpoint without an explicit true or false
 * originating in a button press.
 */

describe("initial state", () => {
  it("opens with the greeting and nothing in progress", () => {
    const { result } = renderHook(() => useConversation("s1"));

    expect(result.current.messages).toEqual([
      { id: 0, from: "agent", text: GREETING },
    ]);
    expect(result.current.draft).toBeNull();
    expect(result.current.question).toBeNull();
    expect(result.current.awaiting).toBe(false);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe("send", () => {
  it("appends what the owner typed, then the reply", async () => {
    send.mockResolvedValue(turn({ reply: "How much oil?" }));
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.send("oil to Ali");
    });

    expect(send).toHaveBeenCalledWith("s1", "oil to Ali");
    expect(result.current.messages.map((m) => m.text)).toEqual([
      GREETING,
      "oil to Ali",
      "How much oil?",
    ]);
  });

  it("shows its own line instead of the CLI summary when the gate opens", async () => {
    // The server's reply at this point is a monospace table meant for the
    // terminal; the card renders the same figures far better.
    send.mockResolvedValue(
      turn({ reply: "Sale to Ali\n  Rice ...", draftSale: DRAFT, awaitingConfirmation: true }),
    );
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.send("2kg rice to Ali");
    });

    expect(result.current.messages.at(-1)?.text).toBe(SALE_READY);
    expect(result.current.awaiting).toBe(true);
    expect(result.current.draft).toEqual(DRAFT);
  });

  it("ignores an empty message", async () => {
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.send("");
    });

    expect(send).not.toHaveBeenCalled();
  });

  it("ignores a second send while one is in flight", async () => {
    let release!: (value: ChatResponse) => void;
    send.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = renderHook(() => useConversation("s1"));

    act(() => { void result.current.send("first"); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      await result.current.send("second");
    });

    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => { release(turn()); });
  });

  it("surfaces a failure without losing the transcript", async () => {
    // The draft survives on the server, so the owner retries one line rather
    // than losing a half-built sale.
    send.mockRejectedValue(new Error("The assistant is unavailable."));
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.send("2kg rice to Ali");
    });

    expect(result.current.error).toBe("The assistant is unavailable.");
    expect(result.current.messages.map((m) => m.text)).toContain("2kg rice to Ali");
    expect(result.current.busy).toBe(false);
  });
});

describe("choose", () => {
  const question = {
    text: 'Did you mean saqib or Ali?',
    choices: [
      { id: "suggestion:3", label: "saqib", intent: "neutral" as const },
      { id: "suggestion:4", label: "Ali", intent: "neutral" as const },
    ],
  };

  async function withQuestion() {
    send.mockResolvedValue(turn({ reply: question.text, question }));
    const hook = renderHook(() => useConversation("s1"));
    await act(async () => {
      await hook.result.current.send("2kg rice to Sakib");
    });
    return hook;
  }

  it("posts the id of the pressed button", async () => {
    const { result } = await withQuestion();
    answer.mockResolvedValue(turn({ reply: "Right." }));

    await act(async () => {
      await result.current.choose("suggestion:4");
    });

    expect(answer).toHaveBeenCalledWith("s1", "suggestion:4");
  });

  it("echoes the pressed label into the transcript", async () => {
    // So the record reads the same whether the owner typed or clicked.
    const { result } = await withQuestion();
    answer.mockResolvedValue(turn({ reply: "Right." }));

    await act(async () => {
      await result.current.choose("suggestion:4");
    });

    expect(result.current.messages.map((m) => m.text)).toContain("Ali");
  });

  it("clears the buttons immediately so they cannot be pressed twice", async () => {
    const { result } = await withQuestion();
    let release!: (value: ChatResponse) => void;
    answer.mockReturnValue(new Promise((r) => { release = r; }));

    act(() => { void result.current.choose("suggestion:4"); });

    await waitFor(() => expect(result.current.question).toBeNull());

    await act(async () => { release(turn()); });
  });

  it("ignores a press while a request is in flight", async () => {
    const { result } = await withQuestion();
    let release!: (value: ChatResponse) => void;
    answer.mockReturnValue(new Promise((r) => { release = r; }));

    act(() => { void result.current.choose("suggestion:3"); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      await result.current.choose("suggestion:4");
    });

    expect(answer).toHaveBeenCalledTimes(1);

    await act(async () => { release(turn()); });
  });
});

describe("the receipt", () => {
  const receipt = {
    saleId: 46,
    receiptNo: 3,
    receiptDate: "2026-08-10",
    url: "/api/sales/46/receipt",
  };

  it("is offered once a sale has been saved", async () => {
    resolve.mockResolvedValue(
      turn({ reply: "Saved. Sale #46 — 800 to Ali. Receipt 003.", receipt }),
    );
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.resolve(true);
    });

    expect(result.current.receipt).toEqual(receipt);
  });

  it("is absent before anything has been saved", () => {
    const { result } = renderHook(() => useConversation("s1"));

    expect(result.current.receipt).toBeNull();
  });

  it("is not offered after a cancellation", async () => {
    resolve.mockResolvedValue(turn({ reply: "Discarded. Nothing was saved." }));
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.resolve(false);
    });

    expect(result.current.receipt).toBeNull();
  });

  it("clears when the next sale begins", async () => {
    // The previous sale's receipt belongs to the previous sale. Leaving the
    // link up while a new one is assembled invites downloading the wrong one.
    resolve.mockResolvedValue(turn({ reply: "Saved.", receipt }));
    send.mockResolvedValue(turn({ reply: "How much oil?" }));
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.resolve(true);
    });
    expect(result.current.receipt).toEqual(receipt);

    await act(async () => {
      await result.current.send("oil to Bilal");
    });

    expect(result.current.receipt).toBeNull();
  });

  it("survives a failed save without offering a link", async () => {
    resolve.mockRejectedValue(new Error("MCP server unreachable"));
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.resolve(true);
    });

    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBe("MCP server unreachable");
  });
});

describe("resolve", () => {
  it.each([true, false])("passes confirmed: %p through explicitly", async (confirmed) => {
    resolve.mockResolvedValue(turn({ reply: "done" }));
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.resolve(confirmed);
    });

    expect(resolve).toHaveBeenCalledWith("s1", confirmed);
  });

  it("clears the card on a successful save", async () => {
    resolve.mockResolvedValue(
      turn({ reply: "Saved. Sale #42 — 600 to Ali.", draftSale: null }),
    );
    const { result } = renderHook(() => useConversation("s1"));

    await act(async () => {
      await result.current.resolve(true);
    });

    expect(result.current.draft).toBeNull();
    expect(result.current.awaiting).toBe(false);
    expect(result.current.messages.at(-1)?.text).toContain("Saved. Sale #42");
  });

  it("leaves the card on screen when the save fails", async () => {
    // A failed save must not look like a completed one.
    send.mockResolvedValue(
      turn({ reply: "summary", draftSale: DRAFT, awaitingConfirmation: true }),
    );
    const { result } = renderHook(() => useConversation("s1"));
    await act(async () => {
      await result.current.send("2kg rice to Ali");
    });

    resolve.mockRejectedValue(new Error("MCP server unreachable"));

    await act(async () => {
      await result.current.resolve(true);
    });

    expect(result.current.error).toBe("MCP server unreachable");
    expect(result.current.draft).toEqual(DRAFT);
    expect(result.current.awaiting).toBe(true);
  });

  it("ignores a second press while the save is in flight", async () => {
    let release!: (value: ChatResponse) => void;
    resolve.mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = renderHook(() => useConversation("s1"));

    act(() => { void result.current.resolve(true); });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      await result.current.resolve(true);
    });

    // Double-tapping Confirm must not write twice.
    expect(resolve).toHaveBeenCalledTimes(1);

    await act(async () => { release(turn()); });
  });
});
