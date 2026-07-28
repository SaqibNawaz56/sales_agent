import express, { type Request, type Response } from "express";

import { loadAgentTools } from "./mcp.js";

const PORT = Number(process.env.API_PORT ?? 3000);

const app = express();
app.use(express.json());

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Reports what the agent can actually see. Useful while building, and it is the
 * surface the Day 7 test asserts against when it checks that save_sale is not
 * advertised to the model.
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

// POST /api/chat and POST /api/sales/confirm arrive on Day 5, once the
// controller and the draft-sale state object exist.

app.listen(PORT, () => {
  console.log(`api listening on http://0.0.0.0:${PORT}`);
});
