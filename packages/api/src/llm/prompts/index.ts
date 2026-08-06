/**
 * Every instruction this system sends to a model, in one directory.
 *
 * Grouped by audience rather than by feature on purpose. The prompts are the
 * part of the system a reviewer most needs to read end to end — they are where
 * R1 and R3 are argued in natural language — and scattering them next to their
 * call sites would mean no single place shows the whole model-facing surface.
 */
export * from "./confirmation-answer.prompt";
export * from "./extraction.prompt";
export * from "./price-answer.prompt";
export * from "./quantity-answer.prompt";
export * from "./query-routing.prompt";
