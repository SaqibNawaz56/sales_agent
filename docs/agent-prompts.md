# Agent Prompt Iterations

Version history of the system prompts given to the LLM, with the reason for each
revision and the failure that prompted it.

This is separate from `prompts.md`, which logs the build instructions given to
the assistant. This file concerns only what the application says to
`llama-3.3-70b-versatile` at runtime.

---

## Tool-invocation prompt

Used in the Day 1 proof that the model reaches a tool served over MCP.

### v1 — Day 1

```text
You are the assistant for a small shop. Answer using the tools available to
you. Never guess a number that a tool can tell you.
```

**Purpose.** Establish that the model routes to an MCP-served tool rather than
answering from its own knowledge.

**Result.** The model called `health_check` and reported the true catalogue
count of 21.

**Note.** *Never guess a number that a tool can tell you* is the prompt-level
counterpart to risk R3. It is not the mitigation — the mitigation is that no
model-emitted price is ever persisted — but it reduces how often the controller
has to override the model.

---

## Extraction prompt

Turns one free-form sale sentence into `customer + items[]`. Lives in
`packages/api/src/extract.ts`. The regression suite is
`packages/api/src/scripts/test-extraction.ts`.

### v2 — Day 2, first working version

Introduced the three-part output (`intent`, `customer`, `items[]`) and the
rules against inventing quantities, emitting prices, and misreading spelled-out
numbers.

The `intent` field was added beyond the proposal's requirement because without
it the extractor invents items from questions — *"what did I sell today?"*
would produce spurious line items rather than being recognised as a query.

**Result: 9/10 on the regression suite.**

### v3 — Day 2, unit-conversion fix

**The failure.** v2 extracted *"1 dozen eggs and bread to Bilal"* as
`quantity: 12, unit: "dozen"`. The model expanded the dozen into individual
units unprompted.

**Why it mattered.** Eggs are priced at 330 per dozen. That sale would have been
written as 12 × 330 = 3,960 instead of 330 — a twelvefold overcharge, in a tool
whose purpose is accurate books. It is precisely the R1 failure mode: plausible
on the confirmation screen unless the owner checks the arithmetic himself.

**The change.** One rule added:

```text
- Never convert between units. The quantity is the count of the unit the owner
  named, exactly as he named it. "1 dozen eggs" is quantity 1 with unit "dozen"
  — it is not quantity 12. "2 packets tea" is quantity 2 with unit "packet".
```

**Result: 10/10, stable across consecutive runs.**

**Method note.** All ten cases were re-run after this edit, not just the failing
one. Rewording a prompt to fix one sentence routinely breaks another, so the
suite is run whole every time.

---

## Current regression suite

| Case | Checks |
|------|--------|
| multi-item sale | customer and two items from one sentence |
| spelled-out number | "two kg" is 2, not 20 (R1) |
| three items, one without a unit | multi-item with mixed detail |
| missing quantity | stays `null` so the checklist can ask (F3/F4) |
| mixed present/missing | one item complete, one incomplete |
| units captured | "3 litres milk" keeps its unit |
| no customer named | `customer: null` rather than invented |
| decimal quantity | "half kg" becomes 0.5 |
| question is not a sale | `intent: "query"`, no items invented |
| price in the sentence | "at 300 rupees" does not become a quantity (R3) |
