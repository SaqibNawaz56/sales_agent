#!/bin/bash
# Boots Ollama with the narrator model already present, from a local file.
#
# `ollama pull` is the usual way to get a model in, and it needs the registry.
# A shop machine may not have it, and the network this was built on could not
# reach one. So the weights ship as a .gguf under models/ and are registered
# from disk with a two-line Modelfile. Nothing here touches the network.
#
# Registration is idempotent and cheap after the first boot: the blob is
# already in the named volume, so `ollama create` re-links rather than re-copies.
set -euo pipefail

MODEL="${NARRATOR_MODEL:-qwen2.5:1.5b}"
FILE="/models/${NARRATOR_MODEL_FILE:-qwen2.5-1.5b-instruct-q4_k_m.gguf}"

if [ ! -f "$FILE" ]; then
  echo "narrator: no weights at $FILE." >&2
  echo "narrator: see models/README.md — put a .gguf there and restart." >&2
  exit 1
fi

# The server has to be up before the CLI can talk to it, so start it first and
# register against it, then hand the container over to it.
ollama serve &
SERVER_PID=$!

for _ in $(seq 1 60); do
  ollama list >/dev/null 2>&1 && break
  sleep 1
done

if ollama list 2>/dev/null | grep -q "^${MODEL%%:*}"; then
  echo "narrator: $MODEL already registered."
else
  echo "narrator: registering $MODEL from $FILE"
  printf 'FROM %s\n' "$FILE" > /tmp/Modelfile
  ollama create "$MODEL" -f /tmp/Modelfile
fi

# PID 1 stays the server, so `docker stop` reaches it and restart policies work.
wait "$SERVER_PID"
