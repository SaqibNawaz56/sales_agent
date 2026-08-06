# Conversational Sales-Logging Agent

A shopkeeper types one plain sentence — *"2kg rice, 2kg sugar and oil to Ali"* —
and it becomes clean, queryable relational data. No forms, no dropdowns.

Arbisoft Software Engineering Internship, week 6 final project.
Seven-day build. Author: Saqib Nawaz.

---

## What it does

Two flows, and only two.

**Log a sale.** The owner describes a transaction in one sentence. The agent
extracts the customer and the line items, resolves each product against the
catalogue for its price, asks a targeted question about anything missing, shows
an itemised summary, and writes the sale only after he confirms.

**Query sales.** He asks a plain-language question — *"what did I sell today?"*,
*"how much has Ali bought?"* — and gets an answer from the same database.

## The rule the design is built around

One operation must never be probabilistic: the sale write.

An agent loop decides its next action from the model's judgement. A financial
write cannot work that way. So the system is split into three layers, and the
write tool is kept out of the model's reach **structurally** rather than by
instruction:

| Layer | Owns |
|-------|------|
| **MCP server** | Every tool, and all database access. Nothing else touches PostgreSQL. |
| **LangChain / ChatGroq** | Language understanding only — what a sentence says, what a reply means. |
| **Controller** | Every decision. The checklist, which question to ask, the confirmation gate, and the write. |

`save_sale` lives on the MCP server like any other tool, but the tool list handed
to the model is an **allowlist**, and it is not on it. The model was never told
the tool exists, so it cannot request it. The write happens in exactly one place
in the codebase — `confirmSale` in `packages/api/src/controller.ts` — reached
only from an explicit confirmation.

```
browser / CLI
      |
      v
  controller  ──── extract / parse ────▶  ChatGroq   (tokens only on the read path)
      |
      | own MCP client
      v
  MCP server  ────────────────────────▶  PostgreSQL
   (all tools, all logging)
```

---

## Running it

Everything runs in Docker. You need Docker Desktop and a
[Groq API key](https://console.groq.com/keys).

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and GROQ_API_KEY
docker compose up -d --build
```

First run only — create the schema and seed the catalogue:

```bash
docker compose run --rm -w /app/packages/mcp-server mcp-server npx prisma migrate deploy
docker compose run --rm -w /app/packages/mcp-server mcp-server npx prisma db seed
```

| Service | URL | Notes |
|---------|-----|-------|
| Web UI | http://localhost:5173 | The primary surface |
| API | http://localhost:3000 | `/api/chat`, `/api/sales/confirm` |
| MCP server | http://localhost:3001/mcp | Streamable HTTP |
| PostgreSQL | `localhost:5433` | **5433**, not 5432 — a local Postgres usually holds 5432 |

The CLI is maintained as a working fallback throughout:

```bash
docker compose run --rm -it -w /app/packages/api api npm run cli
```

`/confirm` saves, `/cancel` discards, `/draft` shows the raw state, `/help`.

To watch the model calls, set `AGENT_TRACE=1` — it prints each prompt, its
latency and its token cost, which is what makes Groq's 12k-tokens-per-minute
limit visible before it bites.

---

## Verifying it

Each day has a script that checks the running containers from the outside, not
the source. They abort rather than reporting green against a dead stack.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-day1.ps1   # MCP spine
powershell -ExecutionPolicy Bypass -File scripts\verify-day2.ps1   # tools + extraction
powershell -ExecutionPolicy Bypass -File scripts\verify-day3.ps1   # checklist + clarification
powershell -ExecutionPolicy Bypass -File scripts\verify-day4.ps1   # sub-loop + confirm gate
powershell -ExecutionPolicy Bypass -File scripts\verify-day5.ps1   # queries + HTTP API
powershell -ExecutionPolicy Bypass -File scripts\verify-day6.ps1   # React UI
```

Integration tests (Jest + Supertest, against the live stack):

```bash
docker compose exec -w /app/packages/api api npm test
```

They cover the five paths named in the plan: happy path, missing quantity,
new product, rejected confirmation, and `save_sale` absent from the tool list.

---

## Layout

```
packages/
  mcp-server/     every tool, Prisma, the only database access in the system
    prisma/       schema, migrations, seed
    src/tools/    define.ts wraps registration so every call is logged

  api/            NestJS. The deterministic controller and the write path.
    src/
      http/       Nest controllers, DTOs, the error filter
      sales/      SaleService — the outer loop, and the only save_sale call
      draft/      the sale being assembled (pure)
      checklist/  per-item completeness rules (pure)
      questions/  clarification question templates (pure)
      clarification/  applying a reply to the one gap that was asked about
      catalogue/  resolution against the database, via MCP
      reporting/  the read path, including customer pseudonymisation
      llm/        every model call, prompt and output schema — nothing outside
      mcp/        tool access and the agent allowlist
      session/    in-memory draft store
      summary/    the itemised summary shown before a write
      cli/        the terminal client
      scripts/    per-day proof scripts
    tests/        Jest integration tests

  frontend/       React + Vite chat UI
    src/
      components/ one component per file
      hooks/      conversation state, session id, scroll anchoring
      api/        one file per endpoint; resolve-sale.ts is the only write
      styles/     one stylesheet per component
scripts/          per-day verification
docs/             agent prompt iteration history
```

---

## Where the implementation differs from the proposal

Each of these was a deliberate decision, not drift.

**MCP runs over HTTP, not stdio** (§4 R9). `stdio` requires the client to spawn
the server as a child process. Across container boundaries there is no shared
process space, so containerising the MCP server rules it out. HTTP also gives a
single shared server rather than one process per client.

**Tool exposure is an allowlist, not a denylist** (§4 R7). The proposal describes
filtering `save_sale` out of the advertised set. A denylist fails open — add a
tool later, forget to exclude it, and it is silently callable. The allowlist
fails closed.

**`lookup_product`, `create_product` and `find_or_create_customer` are
controller-only** (§2, "Agent-exposed MCP tools"). The proposal has the agent
call them. Here the controller does, so no price and no catalogue fact ever
passes through the model — which makes R3 true by construction rather than by
instructing the model not to invent prices.

**Pseudonymisation is real on the query path, not deferred** (§5A). The proposal
defers name-scrubbing to a future NER model and accepts that names reach Groq.
They do not: the shop owns its customer list, so that list is the dictionary.
The owner asks about "Ali"; the model is handed `customer_1` and routes on the
token. It never sees a figure either — answers are formatted from tool results by
application code. Success criterion 15 is literally true.

**`save_sale` verifies the confirmed price** inside its transaction. The proposal
snapshots whatever the current price is. If the catalogue changes between showing
the summary and the owner pressing Confirm, that writes a sale he never approved.
The confirmed price is passed in and the write is refused if it no longer matches.

**Criterion 8 needs one word changed.** "A rejected confirmation leaves the
database entirely unchanged" is not quite what happens: a product added during
the new-product sub-loop stays in the catalogue, because adding it was its own
confirmed action and the shop does now stock it. No *sale* is written.

---

## Known limits

- **Drafts are in-memory.** A container restart discards a sale being assembled.
  Fine for a single-operator shop; an unconfirmed draft is not yet a business
  record. Drafts also expire after an hour.
- **Groq's free tier has two limits, and the daily one is the dangerous one.**
  12,000 tokens per minute, and **100,000 tokens per day**. An extraction costs
  roughly 800–1,500 tokens, so a single model call is cheap but a full sweep is
  not: running every verification script plus the Jest suite plus the demo comes
  to well over 100 calls and will exhaust the *daily* quota in one sitting.
  The per-minute limit clears in seconds; the daily one does not clear until it
  resets. **Do not rehearse the demo on the morning of the demo** — verify the
  day before, then leave the budget alone. The model retries with backoff, and
  the verification scripts report a rate limit as inconclusive rather than as a
  failure, but neither helps once the daily quota is gone.
- **The capture sentence still transits.** Pseudonymisation covers the query
  path. Scrubbing names from a live capture sentence needs local NER, and a fully
  local model would remove the trust boundary altogether. Both remain roadmap.
- **Hot reload needs a restart for new files.** File events do not cross the
  Windows-to-WSL2 bind mount reliably. Editing an existing file reloads; adding
  one often does not.
