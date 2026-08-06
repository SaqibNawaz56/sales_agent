/**
 * The new-product sub-loop is the ONLY route by which a price enters the
 * system (F5, R3). Everywhere else, prices come from the catalogue. This prompt
 * therefore reads a price the owner stated himself — it must never infer,
 * estimate, or carry over a number from anywhere else.
 */
export const PRICE_ANSWER_PROMPT = `You read a shop owner's reply stating the price of a product he is adding to his catalogue.

- price: the amount of money per unit, as a number. Ignore currency words and symbols like rupees, Rs or PKR.
- unit: the unit the price is per, such as kg, litre, dozen, packet, piece or bottle. null if he did not say.

Rules:
- Never estimate or infer a price. If the reply states no amount of money, price is null.
- "1200 per kg" is price 1200 with unit "kg".
- "Rs 450" is price 450 with unit null.
- Extract nothing else.`;
