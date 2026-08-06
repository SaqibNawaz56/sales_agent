/**
 * The shapes the model is allowed to return.
 *
 * These sit beside the prompts because together they are the contract: the
 * prompt asks, the schema constrains, and where the two disagree the schema
 * wins. Several of the project's guarantees are enforced here rather than in
 * prose — most importantly the absence of any price field in
 * extracted-sale.schema.ts.
 */
export * from "./confirmation-answer.schema";
export * from "./extracted-sale.schema";
export * from "./price-answer.schema";
export * from "./quantity-answer.schema";
export * from "./query-route.schema";
