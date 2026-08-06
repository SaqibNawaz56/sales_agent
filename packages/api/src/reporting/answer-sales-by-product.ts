import type { QueryRoute } from "../llm";
import { callServerTool } from "../mcp";
import type { SalesByProductResult } from "./reporting.types";

/** "How much rice have I sold?" */
export async function answerSalesByProduct(route: QueryRoute): Promise<string> {
  if (!route.product) {
    return "Which product did you mean?";
  }

  const result = await callServerTool<SalesByProductResult>(
    "query_sales_by_product",
    { productName: route.product },
  );

  if (!result.found) {
    return `${route.product} isn't in your catalogue.`;
  }
  if (result.quantity === 0) {
    return `You haven't sold any ${result.productName} yet.`;
  }

  return `You've sold ${result.quantity} ${result.unit ?? ""} of ${result.productName}, for ${result.revenue}.`.replace(
    /\s+/g,
    " ",
  );
}
