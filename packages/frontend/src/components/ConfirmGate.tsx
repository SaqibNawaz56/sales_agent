import type { DraftSale } from "../api";

/**
 * The pinned pair of buttons that replaces the composer while a sale waits.
 *
 * The card carries its own pair next to the figures, but the card lives in the
 * scrolling transcript and can be scrolled away from. This cannot: the gate is
 * always one click away without scrolling, whatever the window height. The
 * composer is not merely disabled but swapped out, because there is nothing
 * useful to type at this point — the sale is decided by button, not by text.
 */
export function ConfirmGate({
  draft,
  busy,
  onConfirm,
  onCancel,
}: {
  draft: DraftSale;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="gate">
      <span className="gate-label">
        Save this sale? Total <strong>{draft.grandTotal ?? "—"}</strong>
      </span>
      <button
        type="button"
        className="cancel"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </button>
      <button
        type="button"
        className="confirm"
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? "Saving…" : "Confirm"}
      </button>
    </div>
  );
}
