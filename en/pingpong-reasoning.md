# PingPong Reasoning

A reasoning mode based on a **short, alternating exchange between QPath and an LLM**. Like a ball
bouncing between two players with opposite strengths:

- **QPath returns the deterministic shot** — verified facts, traced deductions, at zero token.
- **The LLM returns the creative shot** — the next step QPath can't take on its own.

The idea: solve what **neither can solve alone**. QPath alone stalls on open-ended reasoning; the LLM
alone hallucinates. PingPong moves the LLM forward **step by step, each step validated by QPath**.

## How it works

Each exchange, the LLM plays **a single move**; QPath answers with a **deterministic verdict**:

| LLM move | QPath does… | Verdict |
|----------|-------------|---------|
| **ask** for a fact | looks it up / derives it | found · unknown |
| **propose** a hypothesis | **verifies** it | verified · refuted · unknown |
| **conclude** | the exchange stops | — |

Three safeguards:

- **Grounding** — the LLM cannot push a false fact through: if QPath knows a different value, it
  **refutes**. No silent hallucination.
- **Growing memory** — a **verified** hypothesis is fed back into memory: next time, QPath answers on its
  own, at zero token.
- **Short exchange** — bounded (a few rounds); it stops as soon as QPath confirms a conclusion, the LLM
  concludes, or the limit is reached. And **the full transcript is kept** (who played what, and QPath's
  verdict) → auditable.

### Integration notes

- ASK / HYPOTHESIS / TOOL moves are **single-line**; the `CONCLUDE` answer may be **multi-line**
  (lists, paragraphs) — everything after the keyword belongs to the answer.
- The game rules are exported (`PINGPONG_SYSTEM_RULES`) so the host can **compose them with its own
  product identity** (`systemPrompt: identity + rules`) instead of replacing it — otherwise the LLM
  loses its identity during the exchange.

## When to use it

| Situation | Recommended mode |
|-----------|------------------|
| The answer is a **symbolic deduction** (inheritance, transitivity) | **ChainResolver** alone (zero token, deterministic) |
| Question **decomposable** into sub-questions handled in one pass | **Flash reasoning** |
| **Open-ended / multi-step** reasoning where the LLM must advance step by step, validating each step | **PingPong** |

In short: PingPong is the right mode when QPath **alone** doesn't conclude, but **each step** toward the
answer *can* be verified by QPath. You keep QPath's rigor **and** the LLM's flexibility.

## Example

QPath supplies the "LLM player" via a small **port** (any LLM: LangChain, a backend proxy…). The reasoner
orchestrates the exchange.

```ts
import { XNeuroneGrid, KnowledgeBase, PingPongReasoner, LlmPort } from '@damba/libxn';

// 1. Plug in an LLM (a minimal adapter here; see Flash reasoning for LangChain)
const llm: LlmPort = {
  async complete(prompt, opts) {
    return await myLLM(prompt, opts?.systemPrompt); // ChatAnthropic, ChatOpenAI, backend…
  },
};

// 2. A QPath memory with a few facts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('alice', 'parent_of', 'charlie');
await kb.tell('charlie', 'parent_of', 'diana');

// 3. The exchange: QPath alone can't conclude "ancestor" — PingPong gets there,
//    by having QPath validate each link (alice→charlie, charlie→diana).
const result = await new PingPongReasoner(kb, llm).run(
  'Is Alice an ancestor of Diana?',
  { seedSubject: 'alice', maxRounds: 3 },
);

console.log(result.conclusion);   // answer grounded on the verified facts
console.log(result.transcript);   // the full exchange, round by round
console.log(result.grounded);     // true: no LLM claim bypassed QPath
```

The result holds the **conclusion**, the **transcript** (each move + QPath verdict), the **learned facts**
(fed back), and `grounded` (every LLM claim was checked against QPath).

::: tip
The protocol's internals are not documented publicly. For technical access or a partnership, contact the
author. See also [Flash reasoning](flash-reasoning) and [Key components](components).
:::
