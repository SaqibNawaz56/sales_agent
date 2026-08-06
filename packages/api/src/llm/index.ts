/**
 * Everything that talks to a language model.
 *
 * The boundary this directory draws is the one the proposal's §2 cares about:
 * inside, the model is asked narrow questions and its answers are validated;
 * outside, no other module constructs a model or writes a prompt. A reviewer
 * asking "what does this system tell the LLM, and what may it say back?" can
 * answer it without leaving this folder.
 */
export * from "./callbacks";
export * from "./create-model";
export * from "./extract-sale";
export * from "./parse-confirmation-answer";
export * from "./parse-price-answer";
export * from "./parse-quantity-answer";
export * from "./prompts";
export * from "./route-question";
export * from "./run-turn";
export * from "./run-turn.types";
export * from "./schemas";
