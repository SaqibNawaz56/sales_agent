# Narrator weights

The `narrator` container reads a GGUF model from this directory. The files
themselves are gitignored — they are hundreds of megabytes and belong to the
machine, not the repository.

Only the optional `narrator` profile uses this. `docker compose up -d` starts
Hisaab without it.

## What to put here

The default, and what the compose file expects:

    qwen2.5-1.5b-instruct-q4_k_m.gguf     ~986 MB

Any other GGUF works — point `NARRATOR_MODEL_FILE` at its filename.

## Where to get it

Download `qwen2.5-1.5b-instruct-q4_k_m.gguf` from the `Qwen/Qwen2.5-1.5B-Instruct-GGUF`
repository on Hugging Face and drop it in this directory.

If you already have Ollama on the host with the model pulled, the blob it stores
*is* a plain GGUF and can simply be copied. Find it via the manifest under
`~/.ollama/models/manifests/registry.ollama.ai/library/qwen2.5/1.5b` — the
largest of the blobs it lists is the weights.

## Why this size

It is what a 7.7 GB laptop that is also running Postgres, a NestJS API and Vite
can host without swapping. It is enough for the narrator's actual job, which is
rewriting one already-correct sentence into plainer English.

It is **not** enough for good Urdu — measured, and the output was unusable. A
larger model would fix that and this machine cannot hold one, so
`NARRATOR_LANGUAGE` is left at `simple English`.
