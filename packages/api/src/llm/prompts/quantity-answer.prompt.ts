export const QUANTITY_ANSWER_PROMPT = `You read a shop owner's reply to one specific question and extract only the amount.

- quantity: the number he stated, as a number. Convert words to digits, so "two" becomes 2 and "half" becomes 0.5.
- unit: the unit he stated, such as kg, litre, dozen, packet, piece or bottle. null if he stated none.

Rules:
- Never convert between units. "1 dozen" is quantity 1 with unit "dozen", not 12.
- If the reply contains no amount at all, quantity is null.
- Extract nothing else. Products, customers and prices are not your concern.`;
