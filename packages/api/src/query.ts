import { z } from "zod";

import { callServerTool } from "./mcp.js";
import { createModel } from "./model.js";
import {
  buildPseudonymMap,
  detokenise,
  tokenise,
  type PseudonymMap,
} from "./pseudonym.js";

/**
 * The read path.
 *
 * The model does exactly one thing here: pick which of three tools answers the
 * question, and name the argument. It does not compose a query (R4), it does
 * not see a real customer name (§5A), and it never sees the result — the answer
 * is assembled from the tool's response by the formatting code below.
 *
 * That last point is the data-minimisation rule in §5A made concrete: figures
 * are not round-tripped through the model just to be put into a sentence.
 */

export const queryRouteSchema = z.object({
  tool: z
    .enum(["daily_total", "sales_by_customer", "sales_by_product", "none"])
    .describe("Which tool answers this question, or none if no tool fits"),
  customer: z
    .string()
    .nullable()
    .describe("The customer token from the question, e.g. customer_1"),
  product: z.string().nullable().describe("The product name asked about"),
  date: z
    .string()
    .nullable()
    .describe("An ISO date YYYY-MM-DD if a specific day was named"),
});

export type QueryRoute = z.infer<typeof queryRouteSchema>;

export const QUERY_ROUTING_PROMPT = `You route a shop owner's question to exactly one of three tools. You do not answer the question and you do not invent figures.

Tools:
- "daily_total": how much was sold on a day. "what did I sell today", "how much did I take yesterday".
- "sales_by_customer": what one person has bought. "how much has customer_1 bought", "what has customer_2 spent".
- "sales_by_product": how much of one product has sold. "how much rice have I sold", "how many eggs went out".
- "none": the question does not fit any of the above.

Fields:
- customer: if the question names a customer, it will appear as a token like customer_1. Copy that token exactly. null otherwise.
- product: the product name asked about, null otherwise.
- date: an ISO date YYYY-MM-DD only if a specific day is named. null for "today" or when no day is named.

Rules:
- Customers always appear as tokens. Never invent a customer name, and never replace a token with a name.
- If the question is vague, such as "how is business", choose "none".
- Choose exactly one tool.`;

async function route(tokenisedQuestion: string): Promise<QueryRoute> {
  const model = createModel("route").withStructuredOutput(queryRouteSchema, {
    name: "query_route",
  });

  const result = await model.invoke([
    { role: "system", content: QUERY_ROUTING_PROMPT },
    { role: "user", content: tokenisedQuestion },
  ]);

  return queryRouteSchema.parse(result);
}

interface DailyTotal {
  date: string;
  sales: number;
  total: number;
}
interface ByCustomer {
  found: boolean;
  customerName: string;
  sales: number;
  total: number;
}
interface ByProduct {
  found: boolean;
  productName: string;
  unit?: string;
  quantity: number;
  revenue: number;
}

const CANNOT_ANSWER =
  "I can answer three things: how much you sold on a day, what one customer has bought, and how much of a product has sold.";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export interface QueryOutcome {
  answer: string;
  /** The exact text sent to the model. Inspected by the criterion 15 test. */
  outboundToModel: string;
  route: QueryRoute;
}

export async function answerQuery(question: string): Promise<QueryOutcome> {
  const map: PseudonymMap = await buildPseudonymMap();

  // Tokenise BEFORE the model is called. This is the boundary.
  const outboundToModel = tokenise(question, map);
  const chosen = await route(outboundToModel);

  if (chosen.tool === "none") {
    return { answer: CANNOT_ANSWER, outboundToModel, route: chosen };
  }

  if (chosen.tool === "daily_total") {
    const result = await callServerTool<DailyTotal>("query_daily_total", {
      ...(chosen.date ? { date: chosen.date } : {}),
    });

    if (result.sales === 0) {
      return {
        answer: `No sales recorded on ${result.date}.`,
        outboundToModel,
        route: chosen,
      };
    }
    return {
      answer: `On ${result.date} you made ${plural(result.sales, "sale")} totalling ${result.total}.`,
      outboundToModel,
      route: chosen,
    };
  }

  if (chosen.tool === "sales_by_customer") {
    if (!chosen.customer) {
      return {
        answer: "Which customer did you mean?",
        outboundToModel,
        route: chosen,
      };
    }

    // Map the token back to a real name locally, immediately before the
    // database call. The name exists only on this side of the boundary.
    const realName = detokenise(chosen.customer, map);
    if (realName === chosen.customer) {
      return {
        answer: "I don't have that customer on file.",
        outboundToModel,
        route: chosen,
      };
    }

    const result = await callServerTool<ByCustomer>("query_sales_by_customer", {
      customerName: realName,
    });

    if (!result.found || result.sales === 0) {
      return {
        answer: `I have no sales recorded for ${realName}.`,
        outboundToModel,
        route: chosen,
      };
    }
    return {
      answer: `${result.customerName} has made ${plural(result.sales, "purchase")} totalling ${result.total}.`,
      outboundToModel,
      route: chosen,
    };
  }

  if (!chosen.product) {
    return { answer: "Which product did you mean?", outboundToModel, route: chosen };
  }

  const result = await callServerTool<ByProduct>("query_sales_by_product", {
    productName: chosen.product,
  });

  if (!result.found) {
    return {
      answer: `${chosen.product} isn't in your catalogue.`,
      outboundToModel,
      route: chosen,
    };
  }
  if (result.quantity === 0) {
    return {
      answer: `You haven't sold any ${result.productName} yet.`,
      outboundToModel,
      route: chosen,
    };
  }
  return {
    answer: `You've sold ${result.quantity} ${result.unit ?? ""} of ${result.productName}, for ${result.revenue}.`.replace(
      /\s+/g,
      " ",
    ),
    outboundToModel,
    route: chosen,
  };
}
