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

### v4 — Day 5, intent classification widened

**The failure.** *"How is business going?"* was classified `other`, not `query`,
so it never reached the query router and the owner got *"I didn't catch a sale
in that"* — a sale-shaped answer to a business question.

v2's wording defined `query` narrowly as "asking about past sales", which a
vague question does not obviously match.

**The change.**

```text
- "query" when he is asking anything about his sales or his business, including vague questions like "how is business?" or "how are things going?".
- "other" only when the message is neither — a greeting, or something unrelated to the shop.
```

**Result.** "how is business going?" now routes to the query path, where the
router returns `none` and the owner is told what *can* be answered — which is
R4's stated mitigation. "hello there" still classifies as `other`. All ten
extraction cases still pass.

---

## Query routing prompt

Lives in `packages/api/src/query.ts`. The model's entire job on the read side.

### v1 — Day 5

```text
You route a shop owner's question to exactly one of three tools. You do not answer the question and you do not invent figures.

Tools:
- "daily_total": how much was sold on a day.
- "sales_by_customer": what one person has bought.
- "sales_by_product": how much of one product has sold.
- "none": the question does not fit any of the above.

Fields:
- customer: if the question names a customer, it will appear as a token like customer_1. Copy that token exactly. null otherwise.
- product: the product name asked about, null otherwise.
- date: an ISO date YYYY-MM-DD only if a specific day is named. null for "today" or when no day is named.

Rules:
- Customers always appear as tokens. Never invent a customer name, and never replace a token with a name.
- If the question is vague, such as "how is business", choose "none".
- Choose exactly one tool.
```

**Two things this prompt does not do**, both deliberate:

It never composes a query. The model picks one of three parameterised tools, so
it cannot produce SQL that is wrong, slow or unsafe (R4).

It never sees a real customer name or any figure. Names arrive already
tokenised, and the tool's result is never sent back to the model — the answer is
formatted from the result by application code. That is what makes success
criterion 15 literally true rather than approximately true.

---

## Clarification answer prompts

Two narrow parsers, added Day 3. They read a reply to one specific question and
return one small fact. Both live in `packages/api/src/answers.ts`.

### Why these are separate from the extraction prompt

When the agent asks *"How much oil (in litre)?"* and the owner replies
*"2 litres"*, that reply is not a sale sentence. Passing it to the extraction
prompt would produce a fresh draft containing only oil and discard the rice and
sugar already understood — precisely the restart F4 forbids.

The protection is structural rather than textual: `quantityAnswerSchema` has
only `quantity` and `unit`. It cannot express a product or a customer, so it
**cannot** restart a sale regardless of what the model does with the wording.

### v1 — quantity answers

```text
You read a shop owner's reply to one specific question and extract only the amount.

- quantity: the number he stated, as a number. Convert words to digits, so "two" becomes 2 and "half" becomes 0.5.
- unit: the unit he stated, such as kg, litre, dozen, packet, piece or bottle. null if he stated none.

Rules:
- Never convert between units. "1 dozen" is quantity 1 with unit "dozen", not 12.
- If the reply contains no amount at all, quantity is null.
- Extract nothing else. Products, customers and prices are not your concern.
```

The unit-conversion rule is carried over from extraction v3 — the same "1 dozen
becomes 12" failure appears here, and fixing it in one prompt does not fix it in
the other.

**Result: 5/5 on first run**, including `"hello there"` correctly returning
`null` rather than a guessed amount. A guessed quantity is the R1 failure mode
and would be invisible on the confirmation summary.

### v1 — confirmation answers

```text
You classify a shop owner's reply to a yes/no question.

- decision: "yes" if he agreed, "no" if he declined, "other" if his reply is neither.
- value: if instead of agreeing he supplied a different name, return that name exactly as he wrote it. Otherwise null.

Rules:
- Never invent a name. If he did not write one, value is null.
- Classify only. Do not extract quantities, products or prices.
```

Handles both "did you mean sugar?" and "add this customer?". The `value` field
exists because owners answer a yes/no question with a correction as often as
with a yes — "no, Ali Raza" has to be usable.

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
