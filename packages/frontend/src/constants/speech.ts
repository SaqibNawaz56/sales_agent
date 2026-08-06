/**
 * Dictation copy.
 *
 * The recogniser itself lives on the server — audio is recorded here and
 * transcribed by Whisper via /api/transcribe, biased with the shop's own
 * product and customer names. The browser's Web Speech API was tried first and
 * replaced: it transcribes against a generic model with no way to tell it what
 * this shop sells, so catalogue words came back as guesses.
 *
 * The transcription language is a server setting (GROQ_TRANSCRIBE_LANGUAGE),
 * not a client one, because it belongs with the model that uses it.
 */
export const MIC_IDLE = "Speak the sale";
export const MIC_RECORDING = "Recording — tap to stop";
export const MIC_TRANSCRIBING = "Transcribing…";
export const MIC_UNAVAILABLE = "This browser cannot record audio";
export const MIC_INSECURE =
  "Recording needs https:// or localhost — the browser blocks the microphone otherwise";
