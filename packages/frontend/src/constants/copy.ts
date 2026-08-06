/**
 * Every string the owner reads that this client invents.
 *
 * Kept together rather than inlined at each use, for the same reason the API
 * keeps its prompts in one directory: it is the whole of what the interface
 * says in its own voice, and everything else on screen comes from the server.
 */

export const GREETING =
  "Tell me what you sold — for example: 2kg rice, 2kg sugar and 1 oil to Ali. You can also ask what you sold today.";

/**
 * Shown instead of the server's reply when a sale becomes complete. The reply
 * at that point contains a monospace summary meant for the CLI, and the card
 * renders the same figures far better, so the raw table is not repeated as
 * chat text.
 */
export const SALE_READY = "Here's the sale — check it over before I save it.";

export const PLACEHOLDER = "What did you sell?";
