/**
 * Day 1 proof: a raw MCP client, in its own process, connecting to the MCP
 * server over HTTP, listing its tools, and invoking one.
 *
 * This is deliberately not a unit test. It exercises the real transport across
 * a real container boundary, which is the integration the proposal flags as the
 * riskiest in the project (R9).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://mcp-server:3001/mcp");

async function main(): Promise<void> {
  const client = new Client({ name: "round-trip-probe", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(url));
  console.log(`connected to ${url.href}`);

  const { tools } = await client.listTools();
  console.log("advertised tools:", tools.map((tool) => tool.name).join(", "));

  const result = await client.callTool({
    name: "health_check",
    arguments: {},
  });
  console.log("health_check ->", JSON.stringify(result.content));

  await client.close();
  console.log("round-trip OK");
}

main().catch((error) => {
  console.error("round-trip FAILED:", error);
  process.exit(1);
});
