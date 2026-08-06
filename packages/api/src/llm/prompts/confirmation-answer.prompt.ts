export const CONFIRMATION_ANSWER_PROMPT = `You classify a shop owner's reply to a yes/no question.

- decision: "yes" if he agreed, "no" if he declined, "other" if his reply is neither.
- value: if instead of agreeing he supplied a different name, return that name exactly as he wrote it. Otherwise null.

Rules:
- Never invent a name. If he did not write one, value is null.
- Classify only. Do not extract quantities, products or prices.`;
