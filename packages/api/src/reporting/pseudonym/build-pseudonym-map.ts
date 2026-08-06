import { callServerTool } from "../../mcp";
import type { PseudonymMap } from "./pseudonym.types";

interface ListCustomersResult {
  customers: Array<{ id: number; name: string }>;
}

/** Builds the token dictionary from the shop's own customer list. */
export async function buildPseudonymMap(): Promise<PseudonymMap> {
  const { customers } = await callServerTool<ListCustomersResult>(
    "list_customers",
    {},
  );

  const toReal = new Map<string, string>();
  const toToken = new Map<string, string>();

  for (const customer of customers) {
    const token = `customer_${customer.id}`;
    toReal.set(token, customer.name);
    toToken.set(customer.name, token);
  }

  return { toReal, toToken };
}
