import { useCallback, useEffect, useRef, useState } from "react";

import { transcribe } from "../api/transcribe";

export type DictationStatus =
  /** No MediaRecorder or no getUserMedia. */
  | "unsupported"
  /** Both exist, but the page is not a secure context so the mic is blocked. */
  | "insecure"
  | "idle"
  | "recording"
  /** Audio captured, waiting on the server. */
  | "transcribing";

export interface Dictation {
  status: DictationStatus;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Containers worth trying, best first.
 *
 * Chrome and Firefox record Opus in WebM; Safari records AAC in MP4. All three
 * are formats Whisper accepts, so the browser is allowed to pick whatever it
 * does best rather than being forced into a lowest common denominator.
 */
const CONTAINERS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickContainer(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CONTAINERS.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function initialStatus(): DictationStatus {
  if (typeof window === "undefined") return "unsupported";
  if (typeof MediaRecorder === "undefined") return "unsupported";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  // getUserMedia is refused outside a secure context, and the failure arrives
  // as a bare permission error long after the owner has pressed the button.
  // localhost counts as secure; a LAN address does not, which is the case that
  // bites when demoing from a phone.
  if (!window.isSecureContext) return "insecure";
  return "idle";
}

/**
 * Records a spoken sale and hands back the transcript.
 *
 * The audio goes to this app's own API, which forwards it to Whisper along with
 * the shop's catalogue and customer names as a spelling hint. That hint is the
 * reason this replaced the browser's built-in Web Speech API: the built-in one
 * transcribes against a generic model that has never heard of "Cheeni" or
 * "Rafey Bhai" and cannot be told about them.
 *
 * PRIVACY. Audio still leaves the machine — it goes to Groq, which already sees
 * every typed sale sentence, rather than to Google. The trust boundary is
 * unchanged from the rest of the system, which was not true of the Web Speech
 * API on Chrome.
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [status, setStatus] = useState<DictationStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // Releases the microphone. Without this the browser keeps its recording
  // indicator lit after the owner has stopped, which reads as "still listening".
  const releaseMic = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
  }, []);

  useEffect(() => releaseMic, [releaseMic]);

  const start = useCallback(async () => {
    if (status !== "idle") return;
    setError(null);

    const container = pickContainer();
    if (!container) {
      setStatus("unsupported");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone blocked. Allow it in the browser's address bar.");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: container });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      releaseMic();
      const blob = new Blob(chunksRef.current, { type: container });
      chunksRef.current = [];

      // A tap rather than a hold: nothing was said, so there is nothing to send
      // and nothing worth telling the owner about.
      if (blob.size < 1024) {
        setStatus("idle");
        return;
      }

      setStatus("transcribing");
      try {
        const text = await transcribe(blob, `dictation.${extensionFor(container)}`);
        if (text) onTextRef.current(text);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        setStatus("idle");
      }
    };

    recorder.start();
    setStatus("recording");
  }, [releaseMic, status]);

  const stop = useCallback(() => {
    // onstop does the rest; setting a status here would race with it.
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  return { status, error, start: () => void start(), stop };
}
