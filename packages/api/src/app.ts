import express, { type Request, type Response } from "express";

import { cancelSale, confirmSale, handleMessage } from "./controller.js";
import { grandTotal, lineTotal, type DraftSale } from "./draft.js";
import { loadAgentTools } from "./mcp.js";

/**
 * Builds the Express app without starting it.
 *
 * Separated from index.ts so Supertest can mount the real routes in-process.
 * A test that spins up a listener on a port would be testing the network as
 * much as the handlers, and would collide with the running container.
 */
export function createApp() {
const app = express();
app.use(express.json());

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Reports what the agent can actually see. Used by the verification scripts to
 * assert that save_sale is not advertised (criterion 13).
 */
app.get("/api/tools", async (_req: Request, res: Response) => {
  try {
    const tools = await loadAgentTools();
    res.json({ tools: tools.map((tool) => tool.name) });
  } catch (error) {
    console.error("failed to load agent tools:", error);
    res.status(502).json({ error: "MCP server unreachable" });
  }
});

/**
 * The shape the client renders. Derived from the draft rather than exposing it
 * directly, so the internal state can change without breaking the UI, and so
 * nothing incidental leaks into a response.
 */
function presentDraft(draft: DraftSale | null) {
  if (!draft) return null;
  return {
    customer: draft.customerName,
    status: draft.status,
    items: draft.items.map((item) => ({
      product: item.productName ?? item.rawProduct,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      lineTotal: lineTotal(item),
    })),
    grandTotal: grandTotal(draft),
  };
}

function sessionIdFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as { sessionId?: unknown }).sessionId;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * POST /api/chat  { sessionId, message }
 *
 * Everything except the write. A sale that becomes complete comes back with
 * awaitingConfirmation true and the itemised draft attached, for the client to
 * render as a confirmation card.
 */
app.post("/api/chat", async (req: Request, res: Response) => {
  const sessionId = sessionIdFrom(req.body);
  const message = (req.body as { message?: unknown })?.message;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const result = await handleMessage(sessionId, message);
    res.json({
      reply: result.reply,
      draftSale: presentDraft(result.draft),
      awaitingConfirmation: result.awaitingConfirmation,
    });
  } catch (error) {
    console.error("chat turn failed:", error);
    // The draft survives a failed turn — the owner retypes one line rather
    // than losing a half-built sale (R6).
    res.status(502).json({ error: "The assistant is unavailable. Try again." });
  }
});

/**
 * POST /api/sales/confirm  { sessionId, confirmed }
 *
 * The ONLY endpoint that writes a sale. Separated from /api/chat on purpose:
 * the state-changing action gets its own explicit route, so the gate is visible
 * in the API surface itself rather than being one possible outcome of sending a
 * message.
 */
app.post("/api/sales/confirm", async (req: Request, res: Response) => {
  const sessionId = sessionIdFrom(req.body);
  const confirmed = (req.body as { confirmed?: unknown })?.confirmed;

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (typeof confirmed !== "boolean") {
    // Not defaulted. A missing flag must never be read as consent to write.
    res.status(400).json({ error: "confirmed must be true or false" });
    return;
  }

  try {
    const result = confirmed
      ? await confirmSale(sessionId)
      : cancelSale(sessionId);

    res.json({
      reply: result.reply,
      draftSale: presentDraft(result.draft),
      awaitingConfirmation: result.awaitingConfirmation,
      saved: confirmed && result.draft === null,
    });
  } catch (error) {
    console.error("confirm failed:", error);
    res.status(502).json({ error: "The sale could not be saved. Try again." });
  }
});

  return app;
}
