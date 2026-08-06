import { z } from "zod";

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
