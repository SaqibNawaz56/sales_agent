# Hisaab

*hisaab* — the accounts; the reckoning. What every shopkeeper keeps, and what
*hisaab kitaab* means when he says he is doing the books.

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
*"how much has Ali bought?"*, *"what did I sell to Ali last time?"* — and gets an
answer from the same database.

Coverage is four fixed tools, not generated SQL, and it grows one tool at a
time. A question none of them reaches gets "I can't answer that" rather than an
improvisation — so a missing answer is a missing tool, never a phrasing problem.

A saved sale also produces a **receipt**: an 80mm-wide PDF carrying the
customer, the day's receipt number, every line at the price charged, and the
grand total. `GET /api/sales/:id/receipt` serves it for any sale, not only the
one just confirmed, so a closed tab does not lose it.

## The rule the design is built around

One operation must never be probabilistic: the sale write.

An agent loop decides its next action from the model's judgement. A financial
write cannot work that way. So the system is split into three layers, and the
write tool is kept out of the model's reach **structurally** rather than by
instruction:

| Layer | Owns |
|-------|------|
| **MCP server** | Every tool, and all database access. Nothing else touches PostgreSQL. |
| **LangChain / DeepSeek** | Language understanding only — what a sentence says, what a reply means. |
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
  controller  ──── extract / parse ────▶  DeepSeek   (tokens only on the read path)
      |
      | own MCP client
      v
  MCP server  ────────────────────────▶  PostgreSQL
   (all tools, all logging)
```

---

## Running it

Everything runs in Docker. You need Docker Desktop and a
[DeepSeek API key](https://platform.deepseek.com/api_keys). A
[Groq key](https://console.groq.com/keys) is optional and buys dictation only —
DeepSeek publishes no audio endpoint, so the microphone goes to Whisper.

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and DEEPSEEK_API_KEY
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
| API | http://localhost:3000 | `/api/chat`, `/api/sales/confirm`, `/api/sales/:id/receipt` |
| MCP server | http://localhost:3001/mcp | Streamable HTTP |
| PostgreSQL | `localhost:5433` | **5433**, not 5432 — a local Postgres usually holds 5432 |

The CLI is maintained as a working fallback throughout:

```bash
docker compose run --rm -it -w /app/packages/api api npm run cli
```

`/confirm` saves, `/cancel` discards, `/draft` shows the raw state, `/help`.

To watch the model calls, set `AGENT_TRACE=1` — it prints each prompt, its
latency and its token cost, which is the only place the real spend is visible
— DeepSeek sends no rate-limit headers for the meter to read.

---

## Verifying it

Two suites, both Jest, split by what they cost to run.

**The unit suites are the default.** No Docker, no database, no API key, no
network at all — `src/mcp` and `src/llm` are mocked at the module boundary, so
what is under test is the part of the system the model is deliberately kept out
of: the checklist, the question templates, the confirmation gate, the tool
allowlist, and every component that gates a write.

```bash
npm test                     # both packages, ~8s
npm run test --workspace @hisaab/api
npm run test --workspace @hisaab/frontend
```

| Suite | Covers |
|-------|--------|
| `packages/api/tests/unit` | draft arithmetic, checklist, questions, clarification (typed and pressed), summary, pseudonymisation, the read path, `advanceDraft`, `SaleService`, the tool allowlist, request schemas, the receipt renderer |
| `packages/frontend/tests` | `useConversation`, `useSessionId`, the API layer, and the components that gate a write — `ConfirmationCard`, `ConfirmGate`, `AnswerChoices`, `Composer` |

That `npm test` costs nothing is the point, not a nicety — see the note on
model cost below.

**The integration suite is opt-in**, and runs against the real stack: real MCP
server, real PostgreSQL, real DeepSeek. A mocked version of these would only prove
that the mocks agree with each other.

```bash
docker compose exec -w /app/packages/api api npm run test:integration
```

It covers the five paths named in the plan: happy path, missing quantity, new
product, rejected confirmation, and `save_sale` absent from the tool list.

Type checking is separate, because `tsx` transpiles without checking:

```bash
npm run typecheck --workspace @hisaab/api
npm run typecheck --workspace @hisaab/frontend
```

The per-day proof scripts in `packages/*/src/scripts/` are kept as a record of
how each day was checked while it was being built. They talk to a live stack and
are not part of either suite.

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
      receipt/    the printable model (pure) and the PDF renderer
      llm/        every model call, prompt and output schema — nothing outside
      mcp/        tool access and the agent allowlist
      session/    in-memory draft store
      summary/    the itemised summary shown before a write
      cli/        the terminal client
      scripts/    per-day proof scripts, against a live stack
    tests/
      unit/       the default suite — mocked, no network
      integration/ the live end-to-end paths, opt-in

  frontend/       React + Vite chat UI
    src/
      components/ one component per file
      hooks/      conversation state, session id, scroll anchoring
      api/        one file per endpoint; resolve-sale.ts is the only write
      styles/     one stylesheet per component
    tests/        jsdom + Testing Library
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
defers name-scrubbing to a future NER model and accepts that names reach the model.
They do not: the shop owns its customer list, so that list is the dictionary.
The owner asks about "Ali"; the model is handed `customer_1` and routes on the
token. It never sees a figure either — answers are formatted from tool results by
application code. Success criterion 15 is literally true.

**`save_sale` verifies the confirmed price** inside its transaction. The proposal
snapshots whatever the current price is. If the catalogue changes between showing
the summary and the owner pressing Confirm, that writes a sale he never approved.
The confirmed price is passed in and the write is refused if it no longer matches.

**The receipt number is stored, not derived.** It would be cheaper to compute
"the nth sale of that day" on read. But a receipt number that can be recomputed
differently later — after a sale is voided, say — is not a receipt number. It is
assigned inside `save_sale`'s transaction, so a sale and its number come into
existence together, and a unique index on `(receipt_date, receipt_no)` means two
sales confirmed in the same instant produce a failed write that retries rather
than a silently shared number.

**Criterion 8 needs one word changed.** "A rejected confirmation leaves the
database entirely unchanged" is not quite what happens: a product added during
the new-product sub-loop stays in the catalogue, because adding it was its own
confirmed action and the shop does now stock it. No *sale* is written.

---

## Known limits

- **Drafts are in-memory.** A container restart discards a sale being assembled.
  Fine for a single-operator shop; an unconfirmed draft is not yet a business
  record. Drafts also expire after an hour.
- **Model calls cost money, and nothing in the UI shows it.** DeepSeek is
  pay-as-you-go rather than a capped free tier, so nothing will cut you off
  mid-demo the way Groq's daily allowance could — but nothing warns you either.
  There was a header-based quota meter in the header; it read the
  `x-ratelimit-*` family, DeepSeek sends none of it, and a meter that is
  permanently blank is worse than no meter. `AGENT_TRACE=1` prints the cost of
  each call and is now the only place spend is visible. An extraction is
  roughly 800–1,500 tokens; the integration suite plus the proof scripts is
  well over 100 calls. The unit suites still mock the model, so the tests you
  run on every save cost nothing.
- **A provider can retire a model without warning.** `llama-3.3-70b-versatile`
  was removed from Groq mid-build and every turn began returning 404 with no
  local change. That is the reason the model id is an environment variable and
  not a constant. Run the app once the day before a demo.
- **The capture sentence still transits.** Pseudonymisation covers the query
  path. Scrubbing names from a live capture sentence needs local NER, and a fully
  local model would remove the trust boundary altogether. Both remain roadmap.
- **Hot reload needs a restart for new files.** File events do not cross the
  Windows-to-WSL2 bind mount reliably. Editing an existing file reloads; adding
  one often does not.
