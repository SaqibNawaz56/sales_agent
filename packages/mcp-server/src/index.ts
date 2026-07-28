import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";

import { buildServer } from "./server.js";

const PORT = Number(process.env.MCP_SERVER_PORT ?? 3001);

const app = express();
app.use(express.json());

// Plain HTTP liveness probe. Not part of MCP — used by compose and by humans.
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/mcp", async (req: Request, res: Response) => {
  // Stateless: a fresh server and transport per request, with no session id.
  //
  // The proposal chose stdio, but containerising the server rules that out —
  // stdio needs the client to spawn the server as a child process, and there is
  // no shared process space across containers. Running stateless over HTTP also
  // sidesteps session affinity, which matters here because two independent
  // clients (the LangChain adapter and the controller's own client) talk to this
  // same process.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode has no server-initiated stream and nothing to tear down, so
// the SSE GET and the session DELETE are both unsupported by design.
function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

app.listen(PORT, () => {
  console.log(`MCP server listening on http://0.0.0.0:${PORT}/mcp`);
});
