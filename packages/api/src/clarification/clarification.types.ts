export interface ApplyResult {
  /** False when the reply did not answer the question that was asked. */
  understood: boolean;
  /** Shown to the owner when his reply could not be used. */
  note?: string;
}
