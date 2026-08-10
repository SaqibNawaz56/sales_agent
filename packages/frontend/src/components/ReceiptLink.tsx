import type { ReceiptRef } from "../api";

/**
 * The receipt for the sale that was just saved.
 *
 * A plain anchor with `download`, not a fetch-and-blob dance: the endpoint
 * already sends Content-Disposition: attachment, so the browser saves the file
 * and the client needs no code to make that happen. It also means the link
 * still works if the owner right-clicks it, opens it in a new tab, or shares it
 * — none of which a JavaScript download handler survives.
 *
 * The number is shown rather than just "download", so the owner can match what
 * he saved against the paper book without opening the file.
 */
export function ReceiptLink({ receipt }: { receipt: ReceiptRef }) {
  const number = String(receipt.receiptNo).padStart(3, "0");

  return (
    <a
      className="receipt-link"
      href={receipt.url}
      download
      // The endpoint returns a PDF whatever the extension; this is what the
      // browser suggests in the save dialog.
      type="application/pdf"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1Z"
        />
        <path
          fill="currentColor"
          d="M5 18a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"
        />
      </svg>
      Download receipt {number}
    </a>
  );
}
