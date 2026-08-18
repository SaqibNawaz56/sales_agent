import { createStructuredModel } from "./create-model";
import { QUERY_ROUTING_PROMPT } from "./prompts";
import { queryRouteSchema, type QueryRoute } from "./schemas";

/**
 * The model's entire job on the read path: pick one of three tools and name the
 * argument.
 *
 * It does not compose a query (R4), it does not see a real customer name (§5A),
 * and it never sees the result. The text passed in here has already been
 * tokenised — that ordering is the boundary, and it is enforced by answerQuery
 * in reporting/, which is the only caller.
 */
export async function routeQuestion(
  tokenisedQuestion: string,
): Promise<QueryRoute> {
  const model = createStructuredModel(queryRouteSchema, "query_route", "route");

  const result = await model.invoke([
    { role: "system", content: QUERY_ROUTING_PROMPT },
    { role: "user", content: tokenisedQuestion },
  ]);

  return queryRouteSchema.parse(result);
}
