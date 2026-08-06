import { routeQuestion, type QueryRoute } from "../llm";
import { answerDailyTotal } from "./answer-daily-total";
import { answerSalesByCustomer } from "./answer-sales-by-customer";
import { answerSalesByProduct } from "./answer-sales-by-product";
import { buildPseudonymMap, tokenise, type PseudonymMap } from "./pseudonym";
import type { QueryOutcome } from "./reporting.types";

const CANNOT_ANSWER =
  "I can answer three things: how much you sold on a day, what one customer has bought, and how much of a product has sold.";

/**
 * The read path.
 *
 * The ordering in this function is the privacy guarantee: the map is built, the
 * question is tokenised, and only then is the model called. Every handler it
 * dispatches to assembles its own sentence from tool results, so a figure from
 * the database is never sent to Groq to be phrased.
 */
export async function answerQuery(question: string): Promise<QueryOutcome> {
  const map: PseudonymMap = await buildPseudonymMap();

  // Tokenise BEFORE the model is called. This is the boundary.
  const outboundToModel = tokenise(question, map);
  const route = await routeQuestion(outboundToModel);

  const answer = await resolveAnswer(route, map);
  return { answer, outboundToModel, route };
}

/** Exhaustive over the four routes the schema permits. */
async function resolveAnswer(
  route: QueryRoute,
  map: PseudonymMap,
): Promise<string> {
  switch (route.tool) {
    case "daily_total":
      return answerDailyTotal(route);
    case "sales_by_customer":
      return answerSalesByCustomer(route, map);
    case "sales_by_product":
      return answerSalesByProduct(route);
    case "none":
      return CANNOT_ANSWER;
  }
}
