import { useEffect, useRef, useState } from "react";

import { resolveSale, sendMessage, type DraftSale } from "./api";
import { ConfirmationCard } from "./ConfirmationCard";

interface Message {
  id: number;
  from: "owner" | "agent";
  text: string;
}

/**
 * The session id is generated once and kept in localStorage, so a refresh does
 * not abandon a sale being assembled. The draft itself lives on the server —
 * this is only the key to it.
 */
function useSessionId(): string {
  const [sessionId] = useState(() => {
    const existing = window.localStorage.getItem("sales-agent-session");
    if (existing) return existing;
    const created = `shop-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem("sales-agent-session", created);
    return created;
  });
  return sessionId;
}

const GREETING =
  "Tell me what you sold — for example: 2kg rice, 2kg sugar and 1 oil to Ali. You can also ask what you sold today.";

export function App() {
  const sessionId = useSessionId();
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, from: "agent", text: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSale | null>(null);
  const [awaiting, setAwaiting] = useState(false);

  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // When the gate appears, bring the TOP of the card into view rather than
    // the bottom of the transcript. Scrolling to the end puts a tall card's
    // header — the customer name and the first items — above the fold, so the
    // owner is asked to approve a sale he can only partly see.
    if (awaiting && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft, busy, awaiting]);

  function append(from: Message["from"], text: string): void {
    setMessages((current) => [...current, { id: nextId.current++, from, text }]);
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const text = input.trim();
    if (text === "" || busy) return;

    append("owner", text);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const response = await sendMessage(sessionId, text);

      // When a sale is complete the server's reply contains a monospace
      // summary meant for the CLI. In the browser the card renders that far
      // better, so the raw table is not repeated as chat text.
      append(
        "agent",
        response.awaitingConfirmation
          ? "Here's the sale — check it over before I save it."
          : response.reply,
      );

      setDraft(response.draftSale);
      setAwaiting(response.awaitingConfirmation);
    } catch (failure) {
      // The draft survives on the server, so the owner retries one line rather
      // than losing a half-built sale (R6).
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(confirmed: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await resolveSale(sessionId, confirmed);
      append("agent", response.reply);
      setDraft(response.draftSale);
      setAwaiting(response.awaitingConfirmation);
    } catch (failure) {
      // The card stays on screen so the owner can try again — a failed save
      // must not look like a completed one.
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Sales Agent</h1>
        <span className="session">{sessionId}</span>
      </header>

      <main className="transcript">
        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.from}`}>
            {message.text}
          </div>
        ))}

        {awaiting && draft && (
          <ConfirmationCard
            ref={cardRef}
            draft={draft}
            busy={busy}
            onConfirm={() => void resolve(true)}
            onCancel={() => void resolve(false)}
          />
        )}

        {busy && <div className="bubble agent thinking">Thinking…</div>}

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <div ref={endRef} />
      </main>

      {awaiting && draft ? (
        <div className="gate">
          <span className="gate-label">
            Save this sale? Total <strong>{draft.grandTotal ?? "—"}</strong>
          </span>
          <button
            type="button"
            className="cancel"
            onClick={() => void resolve(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm"
            onClick={() => void resolve(true)}
            disabled={busy}
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      ) : (
        <form className="composer" onSubmit={(event) => void submit(event)}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="What did you sell?"
            disabled={busy}
            aria-label="Message"
          />
          <button type="submit" disabled={busy || input.trim() === ""}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
