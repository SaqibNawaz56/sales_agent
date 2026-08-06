/**
 * The draft sale — the application's own business state.
 *
 * Deliberately separate from LangChain's message history. The transcript is a
 * record of what was said; this is the sale being assembled, and it is the only
 * thing the write path ever reads. Keeping it out of framework memory means no
 * model output can mutate it except through the controller (see §2, "Memory
 * type", and the architecture boundary).
 */

/** Why an item cannot yet go on a sale. Empty means it is complete. */
export type ItemGap = "unknown_product" | "missing_quantity";

/** Why a draft cannot yet be confirmed, beyond the per-item gaps. */
export type CustomerGap = "missing" | "unconfirmed_new";

export interface Suggestion {
  id: number;
  name: string;
}

export interface DraftItem {
  /** What the owner actually said, kept verbatim for asking about it later. */
  rawProduct: string;
  rawUnit: string | null;

  quantity: number | null;

  /** Filled by resolution against the catalogue. Never supplied by the model. */
  productId: number | null;
  productName: string | null;
  unit: string | null;
  unitPrice: number | null;

  /** Near matches when the product is not in the catalogue (R2). */
  suggestions: Suggestion[];
}

/**
 * "awaiting_confirmation" is a held state, not a passing one. A draft that has
 * reached it must be explicitly confirmed or cancelled — a new message must not
 * silently replace it, or a sale the owner was about to approve disappears
 * because he typed the next one too quickly.
 */
export type DraftStatus = "building" | "awaiting_confirmation";

export interface DraftSale {
  createdAt: string;
  status: DraftStatus;
  /** The message that started this draft, for context in questions. */
  originalMessage: string;

  customerName: string | null;
  customerId: number | null;
  customerSuggestions: Suggestion[];

  items: DraftItem[];

  /** Set when the controller is waiting for an answer to a specific question. */
  pending: PendingQuestion | null;
}

/*
 * The members of PendingQuestion are named individually rather than written
 * inline. Each one is the exact parameter type of one handler in
 * clarification/, so naming them is what lets that dispatcher hand a fully
 * narrowed question to a handler that cannot receive any other kind.
 */

/**
 * A button offered alongside a question.
 *
 * The client renders these and sends back only the `id` of the one pressed —
 * it never invents an answer. The server resolves that id against the choices
 * it issued for the question currently outstanding, so an id that was not
 * offered is refused rather than guessed at.
 *
 * This is the same argument the confirmation gate makes, extended to the other
 * two writes in the system. Adding a customer and adding a product are both
 * database writes, and until now both were gated on a model classifying the
 * word "yes" (R2's "explicit, confirmed action"). A pressed button is not a
 * classification, so on this path the decision cannot be misread.
 *
 * Ids are meaningful strings rather than opaque handles so a request is
 * readable in the tool log: "yes", "no", "new", "suggestion:7".
 */
export interface AnswerChoice {
  id: string;
  label: string;
  /** Presentation only. The server never reads this. */
  intent: "affirm" | "reject" | "neutral";
}

export interface MissingQuantityQuestion {
  kind: "missing_quantity";
  itemIndex: number;
  question: string;
  choices: AnswerChoice[];
}

export interface UnknownProductQuestion {
  kind: "unknown_product";
  itemIndex: number;
  question: string;
  choices: AnswerChoice[];
}

/**
 * The new-product sub-loop (F5). Not produced by the checklist — the checklist
 * only reports that a product is unknown. This is entered when the owner says
 * yes to adding it, and is the only route by which a price enters the system.
 */
export interface NewProductPriceQuestion {
  kind: "new_product_price";
  itemIndex: number;
  question: string;
  choices: AnswerChoice[];
  /** Carries a price already given while the unit is still being asked. */
  priceSoFar?: number;
}

export interface CustomerQuestion {
  kind: "customer";
  itemIndex: null;
  question: string;
  choices: AnswerChoice[];
}

export type PendingQuestion =
  | MissingQuantityQuestion
  | UnknownProductQuestion
  | NewProductPriceQuestion
  | CustomerQuestion;
