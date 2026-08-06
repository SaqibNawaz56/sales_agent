/**
 * Uploads recorded audio and gets text back.
 *
 * Deliberately not a JSON post: audio goes up as multipart so it is never
 * base64-inflated, and the Groq key stays in the API where the browser cannot
 * see it.
 */
export async function transcribe(
  audio: Blob,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, filename);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    let detail = `Transcription failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) detail = payload.error;
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new Error(detail);
  }

  const payload = (await response.json()) as { text?: string };
  return (payload.text ?? "").trim();
}
