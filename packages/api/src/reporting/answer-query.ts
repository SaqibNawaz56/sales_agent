import { routeQuestion, type QueryRoute } from "../llm";
import { narrate } from "../narrator";
import { answerDailyTotal } from "./answer-daily-total";
import { answerLastSale } from "./answer-last-sale";
import { answerSalesByCustomer } from "./answer-sales-by-customer";
import { answerSalesByProduct } from "./answer-sales-by-product";
import { buildPseudonymMap, tokenise, type PseudonymMap } from "./pseudonym";
import type { AnswerParts, QueryOutcome } from "./reporting.types";

const CANNOT_ANSWER =
  "I can answer four things: how much you sold on a day, what one customer has bought, what they bought on their last visit, and how much of a product has sold.";

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

  const { text, receipt } = await resolveAnswer(route, map);

  /*
   * The optional last step, and note where it is: AFTER the sentence has been
   * assembled from tool results, never before.
   *
   * The narrator rewrites a finished answer — it is not consulted about what
   * the answer is. It runs on a local model, so the real name and the real
   * figures it sees do not leave the machine, which is why this is the one
   * place in the read path a model may hold either. It is off unless
   * NARRATOR_URL and NARRATOR_LANGUAGE are both set, and any failure — slow,
   * absent, or a rewrite that altered a figure — returns this same sentence.
   */
  return {
    // Only the sentence is narrated. The receipt travels beside it untouched,
    // so a rewrite cannot change which sale the owner is offered.
    answer: await narrate(text),
    outboundToModel,
    route,
    receipt: receipt ?? null,
  };
}

/**
 * Exhaustive over the routes the schema permits.
 *
 * No default branch on purpose: adding a tool to the enum without a handler
 * here is a compile error, rather than a route that silently answers nothing.
 */
async function resolveAnswer(
  route: QueryRoute,
  map: PseudonymMap,
): Promise<AnswerParts> {
  switch (route.tool) {
    case "daily_total":
      return { text: await answerDailyTotal(route) };
    case "sales_by_customer":
      return { text: await answerSalesByCustomer(route, map) };
    // The one handler that returns more than a sentence: its answer is about a
    // single sale, so it can say which receipt that is.
    case "last_sale_for_customer":
      return answerLastSale(route, map);
    case "sales_by_product":
      return { text: await answerSalesByProduct(route) };
    case "none":
      return { text: CANNOT_ANSWER };
  }
}
