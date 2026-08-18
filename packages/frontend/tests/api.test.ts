import { answerQuestion } from "../src/api/answer-question";
import { postJson } from "../src/api/post-json";
import { resolveSale } from "../src/api/resolve-sale";
import { sendMessage } from "../src/api/send-message";

const fetchMock = () => global.fetch as jest.MockedFunction<typeof fetch>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const EMPTY_TURN = {
  reply: "ok",
  draftSale: null,
  question: null,
  awaitingConfirmation: false,
};

describe("postJson", () => {
  it("posts JSON and returns the parsed body", async () => {
    fetchMock().mockResolvedValue(jsonResponse(EMPTY_TURN));

    const result = await postJson("/api/chat", { sessionId: "s1" });

    expect(fetchMock()).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(result).toEqual(EMPTY_TURN);
  });

  it("prefers the server's own wording for a failure", async () => {
    // More specific than anything generic invented here.
    fetchMock().mockResolvedValue(
      jsonResponse({ error: "The assistant is unavailable. Try again." }, false, 502),
    );

    await expect(postJson("/api/chat", {})).rejects.toThrow(
      "The assistant is unavailable. Try again.",
    );
  });

  it("falls back to the status line when the error body is not JSON", async () => {
    fetchMock().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(postJson("/api/chat", {})).rejects.toThrow(
      "Request failed (500)",
    );
  });

  it("falls back when the error body is JSON without an error field", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ detail: "nope" }, false, 400));

    await expect(postJson("/api/chat", {})).rejects.toThrow(
      "Request failed (400)",
    );
  });
});

describe("the three endpoints", () => {
  beforeEach(() => {
    fetchMock().mockResolvedValue(jsonResponse(EMPTY_TURN));
  });

  it("sendMessage posts what the owner typed", async () => {
    await sendMessage("s1", "2kg rice to Ali");

    const [path, init] = fetchMock().mock.calls[0];
    expect(path).toBe("/api/chat");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      sessionId: "s1",
      message: "2kg rice to Ali",
    });
  });

  it("answerQuestion posts only the id of the pressed button", async () => {
    await answerQuestion("s1", "suggestion:7");

    const [path, init] = fetchMock().mock.calls[0];
    expect(path).toBe("/api/answer");
    // The client never invents an answer; the server resolves this id against
    // the question it last issued.
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      sessionId: "s1",
      choiceId: "suggestion:7",
    });
  });

  it.each([true, false])("resolveSale always sends confirmed: %p", async (confirmed) => {
    await resolveSale("s1", confirmed);

    const [path, init] = fetchMock().mock.calls[0];
    expect(path).toBe("/api/sales/confirm");
    // Never defaulted. The server rejects the request outright if it is absent.
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      sessionId: "s1",
      confirmed,
    });
  });
});
