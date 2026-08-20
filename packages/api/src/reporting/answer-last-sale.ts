import type { QueryRoute } from "../llm";
import { callServerTool } from "../mcp";
import { detokenise, type PseudonymMap } from "./pseudonym";
import type {
  AnswerParts,
  LastSaleItem,
  LastSaleResult,
} from "./reporting.types";

/**
 * "What did Ali buy last time?"
 *
 * The question this tool exists to answer used to route to sales_by_customer
 * and come back with "Ali has made 16 purchases totalling 11200" — true, and a
 * non-answer. No amount of rephrasing fixes that; the query has to exist.
 *
 * Like every other handler here, the sentence is assembled from tool results by
 * this function. The figures never go to Groq to be worded, which is what keeps
 * criterion 15 true for this route as well as the older three.
 *
 * This is the one route that also hands back a receipt. It is the only query
 * whose answer is about exactly one sale, so it is the only one where "which
 * receipt?" has a single answer — a daily total covers many, and a customer's
 * lifetime spend covers all of them.
 */
export async function answerLastSale(
  route: QueryRoute,
  map: PseudonymMap,
): Promise<AnswerParts> {
  if (!route.customer) {
    return { text: "Which customer did you mean?" };
  }

  const realName = detokenise(route.customer, map);
  if (realName === route.customer) {
    // The model returned something token-shaped that is not a token we issued.
    return { text: "I don't have that customer on file." };
  }

  const result = await callServerTool<LastSaleResult>(
    "query_last_sale_for_customer",
    { customerName: realName },
  );

  if (!result.found) {
    return { text: `I don't have ${realName} on file.` };
  }
  if (!result.hasSale) {
    return { text: `I have no sales recorded for ${result.customerName}.` };
  }

  // Built from the tool's own result, never from anything the model produced:
  // the id that ends up in the download URL is one the database just handed
  // back. The model is not told this sale's id, and could not have named it.
  const receipt = receiptRefFrom(result);

  const items = result.items ?? [];
  if (items.length === 0) {
    // A sale with no line items should not exist — save_sale requires at least
    // one. Answered rather than crashed, because a reporting query is not the
    // place to discover it.
    return {
      text: `${result.customerName}'s last sale on ${result.date} came to ${result.total}.`,
      receipt,
    };
  }

  return {
    text:
      `${result.customerName}'s last sale was on ${result.date}: ` +
      `${listItems(items.map(describe))}. That came to ${result.total}.`,
    receipt,
  };
}

/**
 * The receipt for a found sale, or null when the tool did not return enough to
 * identify one.
 *
 * Every field is optional on LastSaleResult, so this refuses to build a partial
 * reference rather than offering a link that would 404. An answer without a
 * receipt is a smaller failure than a receipt button that does not work.
 */
function receiptRefFrom(result: LastSaleResult) {
  if (
    result.saleId === undefined ||
    result.receiptNo === undefined ||
    result.date === undefined
  ) {
    return null;
  }

  return {
    saleId: result.saleId,
    receiptNo: result.receiptNo,
    receiptDate: result.date,
  };
}

/**
 * "a", "a and b", "a, b and c".
 *
 * Deliberately not questions/formatList, which joins with "or" because it was
 * written to offer alternatives — "did you mean Rice or Sugar?". These items
 * were all bought together, and "Rice, Sugar or Oil" would read as a choice
 * the owner still has to make.
 */
function listItems(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "2 kg of Rice at 300" — quantity, unit and the price actually charged. */
function describe(item: LastSaleItem): string {
  const amount = String(Number(item.quantity.toFixed(3)));
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${amount}${unit} of ${item.productName} at ${item.unitPrice}`;
}
