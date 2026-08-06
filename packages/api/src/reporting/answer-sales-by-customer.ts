import type { QueryRoute } from "../llm";
import { callServerTool } from "../mcp";
import { detokenise, type PseudonymMap } from "./pseudonym";
import { plural } from "./plural";
import type { SalesByCustomerResult } from "./reporting.types";

/**
 * "How much has Ali bought?"
 *
 * The token is mapped back to a real name locally, immediately before the
 * database call. The name exists only on this side of the boundary — it was
 * never in the payload sent to Groq, and it is not sent back there.
 */
export async function answerSalesByCustomer(
  route: QueryRoute,
  map: PseudonymMap,
): Promise<string> {
  if (!route.customer) {
    return "Which customer did you mean?";
  }

  const realName = detokenise(route.customer, map);
  if (realName === route.customer) {
    // The model returned something token-shaped that is not a token we issued.
    return "I don't have that customer on file.";
  }

  const result = await callServerTool<SalesByCustomerResult>(
    "query_sales_by_customer",
    { customerName: realName },
  );

  if (!result.found || result.sales === 0) {
    return `I have no sales recorded for ${realName}.`;
  }

  return `${result.customerName} has made ${plural(result.sales, "purchase")} totalling ${result.total}.`;
}
