import { useCallback, useState, type SubmitEvent } from "react";

import { PLACEHOLDER } from "../constants/copy";
import { MIC_RECORDING, MIC_TRANSCRIBING } from "../constants/speech";
import { useDictation } from "../hooks/use-dictation";
import { MicButton } from "./MicButton";

/**
 * The message box.
 *
 * Owns its own draft text. That input is presentation state with no bearing on
 * the sale, so keeping it here rather than in useConversation means typing a
 * character does not re-render the transcript.
 *
 * Dictation writes into the same input rather than sending on its own. A
 * misheard sentence is cheaper to correct in the box than to unpick from a
 * draft, and it keeps one rule true for every message: nothing reaches the
 * agent until the owner presses Send.
 */
export function Composer({
  busy,
  onSend,
}: {
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");

  // Appended rather than replacing, so dictating a second phrase adds to what
  // is already there instead of wiping a correction the owner just typed.
  const dictation = useDictation(
    useCallback((text: string) => {
      setInput((current) => `${current} ${text}`.trim());
    }, []),
  );

  // SubmitEvent, not the FormEvent the first draft used: React 19's types
  // deprecate FormEvent outright ("doesn't actually exist") in favour of the
  // specific event each handler receives.
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = input.trim();
    if (text === "" || busy) return;
    dictation.stop();
    setInput("");
    onSend(text);
  }

  const recording = dictation.status === "recording";
  const transcribing = dictation.status === "transcribing";

  const placeholder = recording
    ? MIC_RECORDING
    : transcribing
      ? MIC_TRANSCRIBING
      : PLACEHOLDER;

  return (
    <>
      {dictation.error && (
        <div className="mic-note" role="status">
          {dictation.error}
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          disabled={busy}
          aria-label="Message"
        />
        <MicButton
          status={dictation.status}
          busy={busy}
          onStart={dictation.start}
          onStop={dictation.stop}
        />
        <button type="submit" disabled={busy || input.trim() === ""}>
          Send
        </button>
      </form>
    </>
  );
}
