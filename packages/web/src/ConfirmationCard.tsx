import type { Ref } from "react";

import type { DraftSale } from "./api";

/**
 * The confirmation gate, rendered (F8).
 *
 * This is the one place the client is not merely a display layer. The summary
 * becomes a table with two buttons rather than requiring the owner to type
 * "yes", which makes confirming a deliberate physical action — and means the
 * gate never depends on interpreting free text.
 *
 * Every figure shown comes from the server's draft. Nothing is computed here:
 * a total calculated in the browser could disagree with the one about to be
 * written, and the owner would be approving the wrong number.
 */
export function ConfirmationCard({
  draft,
  busy,
  onConfirm,
  onCancel,
  ref,
}: {
  draft: DraftSale;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Lets App scroll the top of the card into view when the gate opens. */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="card" ref={ref}>
      <div className="card-head">
        Sale to <strong>{draft.customer ?? "unknown customer"}</strong>
      </div>

      <div className="card-body">
        <table className="items">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Price</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, index) => (
              <tr key={`${item.product}-${index}`}>
                <td>{item.product}</td>
                <td className="num">
                  {item.quantity ?? "—"} {item.unit ?? ""}
                </td>
                <td className="num">{item.unitPrice ?? "—"}</td>
                <td className="num">{item.lineTotal ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Outside the scrolling body on purpose — the figure being approved must
          never be the thing that scrolled out of sight. */}
      <div className="card-total">
        <span>Total</span>
        <strong>{draft.grandTotal ?? "—"}</strong>
      </div>

      <div className="card-actions">
        <button
          type="button"
          className="confirm"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Saving…" : "Confirm"}
        </button>
        <button
          type="button"
          className="cancel"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
