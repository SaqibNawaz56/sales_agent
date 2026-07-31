import { callServerTool } from "./mcp.js";

/**
 * Pseudonymisation for the query path (F12, §5A, success criterion 15).
 *
 * The proposal's §5A defers name-scrubbing to a future NER model, and treats it
 * as unavoidable that real names reach Groq. On the query path that is not
 * actually true: the shop owns the list of customers, so the dictionary needed
 * to recognise a name is already in the database. No NER required.
 *
 * The owner asks "how much has Ali bought?"; the model is handed "how much has
 * customer_1 bought?" and routes on the token. The mapping never leaves this
 * process, and the answer is assembled from tool results by application code —
 * so no real name and no stored figure is ever in an outbound payload.
 *
 * Scope is deliberately customers only. The catalogue is not personal data, and
 * tokenising product names would make routing questions impossible to
 * understand.
 */

export interface PseudonymMap {
  /** token -> the real name it stands for */
  readonly toReal: ReadonlyMap<string, string>;
  /** real name -> its token */
  readonly toToken: ReadonlyMap<string, string>;
}

interface ListCustomersResult {
  customers: Array<{ id: number; name: string }>;
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every known customer name in the text with its token.
 *
 * Longest names first: with "Ali" and "Ali Raza" both on file, replacing "Ali"
 * first would turn "Ali Raza" into "customer_1 Raza" and lose the distinction
 * between two different people.
 */
export function tokenise(text: string, map: PseudonymMap): string {
  const names = [...map.toToken.keys()].sort((a, b) => b.length - a.length);

  let result = text;
  for (const name of names) {
    const token = map.toToken.get(name) as string;
    result = result.replace(
      new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"),
      token,
    );
  }
  return result;
}

/** Maps tokens back to real names, locally, after the model has responded. */
export function detokenise(text: string, map: PseudonymMap): string {
  let result = text;
  for (const [token, name] of map.toReal) {
    result = result.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi"), name);
  }
  return result;
}

/** True if the text still contains any real customer name. For assertions. */
export function containsRealName(text: string, map: PseudonymMap): boolean {
  for (const name of map.toToken.keys()) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text)) return true;
  }
  return false;
}
