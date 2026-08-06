import {
  MIC_IDLE,
  MIC_INSECURE,
  MIC_RECORDING,
  MIC_TRANSCRIBING,
  MIC_UNAVAILABLE,
} from "../constants/speech";
import type { DictationStatus } from "../hooks/use-dictation";

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
      />
      <path
        fill="currentColor"
        d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11Z"
      />
      {muted && (
        <path
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          d="M4 4l16 16"
        />
      )}
    </svg>
  );
}

/** Three dots while the server transcribes; the mic would read as "still recording". */
function WaitingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="5" cy="12" r="2" fill="currentColor" opacity="0.35" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.65" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

/**
 * The dictation toggle.
 *
 * Hidden entirely when the browser cannot record — a button that can never work
 * is worse than no button. When the page is not a secure context the button is
 * shown but disabled, since that one the owner can actually fix by using
 * localhost or https.
 */
export function MicButton({
  status,
  busy,
  onStart,
  onStop,
}: {
  status: DictationStatus;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (status === "unsupported") return null;

  const insecure = status === "insecure";
  const recording = status === "recording";
  const transcribing = status === "transcribing";

  const title = insecure
    ? MIC_INSECURE
    : recording
      ? MIC_RECORDING
      : transcribing
        ? MIC_TRANSCRIBING
        : status === "idle"
          ? MIC_IDLE
          : MIC_UNAVAILABLE;

  return (
    <button
      type="button"
      className={`mic${recording ? " recording" : ""}${transcribing ? " transcribing" : ""}`}
      onClick={recording ? onStop : onStart}
      disabled={busy || insecure || transcribing}
      title={title}
      aria-label={title}
      aria-pressed={recording}
    >
      {transcribing ? <WaitingIcon /> : <MicIcon muted={insecure} />}
    </button>
  );
}
