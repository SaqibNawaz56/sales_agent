/**
 * Pseudonymisation for the query path (F12, §5A, success criterion 15).
 *
 * The proposal's §5A defers name-scrubbing to a future NER model, and treats it
 * as unavoidable that real names reach Groq. On the query path that is not
 * actually true: the shop owns the list of customers, so the dictionary needed
 * to recognise a name is already in the database. No NER required.
 *
 * The owner asks "how much has Ali bought?"; the model is handed "how much has
 * customer_1 bought?" and routes on the token. The mapping never leaves this
 * process, and the answer is assembled from tool results by application code —
 * so no real name and no stored figure is ever in an outbound payload.
 *
 * Scope is deliberately customers only. The catalogue is not personal data, and
 * tokenising product names would make routing questions impossible to
 * understand.
 */
export interface PseudonymMap {
  /** token -> the real name it stands for */
  readonly toReal: ReadonlyMap<string, string>;
  /** real name -> its token */
  readonly toToken: ReadonlyMap<string, string>;
}
