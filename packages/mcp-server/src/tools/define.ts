import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Prisma } from "@prisma/client";
import type { ZodRawShape } from "zod";

import { prisma } from "../db.js";

export interface ToolDefinition<Shape extends ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
}

/**
 * Writes one row to tool_call_logs.
 *
 * Logging must never be able to fail a tool call. An audit trail that can take
 * the shop offline is worse than no audit trail, so a failed write is reported
 * to stderr and swallowed.
 */
async function writeLog(
  toolName: string,
  args: unknown,
  status: "ok" | "error",
  durationMs: number,
): Promise<void> {
  try {
    await prisma.toolCallLog.create({
      data: {
        toolName,
        arguments: (args ?? {}) as Prisma.InputJsonValue,
        status,
        durationMs,
      },
    });
  } catch (error) {
    console.error(`failed to write tool_call_log for ${toolName}:`, error);
  }
}

/**
 * Registers an MCP tool and logs every invocation.
 *
 * Every tool goes through here, which is what makes the audit trail complete
 * rather than best-effort: logging lives at the server, so it captures calls
 * from any client — including the controller's own `save_sale`, which the agent
 * never sees. Adding a tool without logging it now requires deliberately
 * bypassing this function.
 *
 * Handlers return a plain JSON-serialisable value; the MCP content envelope is
 * applied here so individual tools do not each re-implement it.
 */
export function defineTool<Shape extends ZodRawShape>(
  server: McpServer,
  definition: ToolDefinition<Shape>,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
): void {
  server.registerTool(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (rawArgs: any) => {
      const started = Date.now();

      // Models emit `null` rather than `{}` for zero-argument tools.
      const args: Record<string, unknown> =
        rawArgs && typeof rawArgs === "object" ? rawArgs : {};

      try {
        const payload = await handler(args);
        await writeLog(definition.name, args, "ok", Date.now() - started);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeLog(definition.name, args, "error", Date.now() - started);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: message }) },
          ],
          isError: true,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );
}
