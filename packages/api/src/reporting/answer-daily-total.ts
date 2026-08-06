import type { QueryRoute } from "../llm";
import { callServerTool } from "../mcp";
import { plural } from "./plural";
import type { DailyTotalResult } from "./reporting.types";

/**
 * "What did I sell today?"
 *
 * The sentence is assembled here from the tool's numbers. Nothing is round
 * -tripped through the model just to be phrased — that is the data-minimisation
 * rule in §5A made concrete.
 */
export async function answerDailyTotal(route: QueryRoute): Promise<string> {
  const result = await callServerTool<DailyTotalResult>("query_daily_total", {
    ...(route.date ? { date: route.date } : {}),
  });

  if (result.sales === 0) {
    return `No sales recorded on ${result.date}.`;
  }

  return `On ${result.date} you made ${plural(result.sales, "sale")} totalling ${result.total}.`;
}
