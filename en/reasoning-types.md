# Reasoning types

QPath doesn't "reason" in a single way. QPath offers a **family of reasoning modes**, all applied to the
same representation — `(subject, predicate, object)` facts indexed in the grid. Each mode has an
**explicit token cost**: either **0 tokens** (deterministic, computed over the facts), or **LLM** (only
when the deterministic path doesn't suffice).

> 💡 **Ordering principle (the QPath pipeline).** Always try the most **deterministic, 0-token path
> first**, and the LLM **as a last resort**. A known fact, an inheritance chain, an aggregate, a temporal
> question — all answer **without calling a model**. The LLM (via PingPong) only steps in when no
> deterministic path succeeds — and even then, **every LLM claim is checked against QPath** (no
> memorized hallucination).

## Summary table

| Family | Mode / API | Cost | Answers |
|---|---|---|---|
| Direct lookup | `ask`, `askInverse`, `askWithCounts` | **0** | "What is (s, p)?", "Who has (p, o)?" |
| Inheritance & transitivity | `reason`, `classesOf`, `askInherited`, `checkInherited`, `askDeep`, `isA` | **0** | "Is X a Y?", "Does X inherit this attribute?" (with exceptions) |
| Backward chaining | `ChainResolver` + `PredicateAlgebra` | **0** | "Link X to an object via composed predicate P" (shortest chain) |
| Forward chaining | `RuleEngine` (+ `RuleInducer`, `RelationTaxonomy`) | **0** | "As soon as we know A, derive B" (if…then rules) |
| Set queries | `askIntersect`, `askUnion`, `askDifference`, `askCompare`, `askSimilar` | **0** | "Who satisfies A AND B?", "How do X and Y differ?" |
| Numeric & quantifiers | `askNumeric`, `aggregate`, `aggregateAll`, `compute`, `stats`, `forAll`, `exists` | **0** | "How many? Average? All / at least one?" |
| Temporal | `valueAsOf`, `factAsOf`, `historyOf`, `statusOf` | **0** | "What was the value on that date? Did it change? Is it stale?" |
| Natural-language questions | `deterministicAnswer` | **0** | "How many…? Average of…? History of…?" |
| Causal & narrative | `PlotReasoner` (`why`, `consequencesOf`, `timeline`, `incoherences`) | **0** | "Why? What consequences? In what order?" |
| Proactive (no question) | `InsightEngine`, `findContradictions` | **0** | "What's wrong / missing / contradictory?" |
| Verification & freshness | `FactVerifier` | **0** mechanical (+ channels) | "Does this fact still hold?" |
| Structural analogy | `PathAlgebra` | **0** | "A is to B as C is to…?" |
| **Hybrid LLM ↔ QPath** | `PingPongReasoner` | **LLM** (grounded) | Open questions; every step checked by QPath |

The sections below **define** each family. Modes that have their own page link to it.

---

## 1. Direct lookup (0 tokens)

The simplest reasoning: read a fact that was asserted.

- **`ask(s, p)` → `string[]`** — every object `o` such that `(s, p, o)` exists. Source of truth = a
  reliable mirror index (not the raw grid), so **correct by construction**.
- **`askInverse(p, o)` → `string[]`** — the inverse: every subject `s` such that `(s, p, o)`. Answers
  "who lives in Paris?".
- **`askWithCounts(s, p)`** — like `ask`, but each object carries a **count** and a proportional
  **confidence** (a fact asserted 3 times out of 4 → 0.75). Used to weight chains.

> Every other reasoning mode builds on these 0-token lookups.

## 2. Inheritance & transitivity (0 tokens)

Derive what wasn't said explicitly, by following **class** links (`est`/`est_un`/`is`).

- **`reason(s, p)` → chain | `null`** — finds an object via an inheritance chain `s —is→ … —is→ o` and
  returns the **full chain** (traceable), or `null`. (`reasonMultiHop` is the explicit multi-hop variant.)
- **`classesOf(s)`** — the **transitive closure**: every class `s` inherits from, with distance.
- **`isA(s, c)`** — "is `s` (transitively) a `c`?".
- **`askInherited(s, p)`** — inheritance **with exceptions** (nearest wins): walks up the hierarchy to
  the class that decides, honoring an **explicit negation**. Classic example: a penguin is a bird, birds
  fly, but "penguin does NOT fly" → the answer is "false, decided at the penguin level".
  `checkInherited` is the matching check.
- **`askDeep(s)`** — every object reachable from `s` through inheritance chains, with the path.

## 3. Declarative backward chaining — ChainResolver (0 tokens)

When the sought predicate is **not** stored directly but **derivable by composing** predicates. See also
**[Flash reasoning](/en/flash-reasoning)**.

- **`PredicateAlgebra`** declares HOW predicates compose: `declareTransitive('est')`,
  `declareInheritance('est')`, `declareComposition('parent_of', 'parent_of', 'grandparent_of')`,
  `declareInverse('parent_of', 'child_of')`.
- **`ChainResolver.chain(s, targetP)`** finds the **shortest** chain linking `s` to an object via the
  composed predicate `targetP`; **`chainAll`** returns all chains (sorted by confidence);
  **`verifyChain(s, p, o)`** checks that a chain leads exactly to `o`.

> Example: without ever storing "grandparent", `chain('lea', 'grandparent_of')` composes two
> `parent_of` links and concludes — showing both steps.

## 4. Forward chaining — if…then rules (0 tokens)

The reverse: as soon as a fact is written, **derive** its consequences. See **[Components](/en/components)**.

- **`RuleEngine`** — multi-variable Datalog-style rules: `X is human ; X lives_in france => X speaks
  french`. On each `tell`, matching rules add their conclusions as **derived facts** (provenance traced),
  with guards against infinite cascades.
- **`RuleInducer`** — **discovers** candidate rules by mining the base's regularities (with support,
  confidence and explicit **counterexamples**) — for a human to validate. 0 tokens.
- **`RelationTaxonomy`** — generalizes predicates: declare that `mother_of` is a form of `parent_of`, and
  each `(alice, mother_of, bob)` also derives `(alice, parent_of, bob)`.

## 5. Set queries (0 tokens)

Reason over **sets** of subjects.

- **`askIntersect(conditions)`** — subjects satisfying **all** `(p, o)` conditions (AND).
- **`askUnion(conditions)`** — satisfying **at least one** (OR).
- **`askDifference(positives, negatives)`** — in one set but not the other.
- **`askCompare(s1, s2)`** — **common** facts and **differences** between two subjects.
- **`askSimilar(s)`** — the subjects **closest** to `s` (by shared facts).

## 6. Numeric & quantifiers (0 tokens)

- **`askNumeric(p, op, v)`** — subjects whose value of `(s, p)` satisfies `>`, `<`, `>=`, `<=`, `=`,
  `!=`, `between`.
- **`aggregate(s, p, fn)`** / **`aggregateAll(p, fn)`** / **`compute(filter, fn)`** — aggregates
  (`count`, `sum`, `avg`, `min`, `max`, `median`, `variance`, `stddev`, `range`) over one subject, all,
  or a filter. **`stats(filter)`** returns every statistic at once.
- **`forAll(scope, test)`** / **`exists(scope, test)`** — universal / existential quantifiers, with
  explicit **counterexamples** (or witnesses).

## 7. Temporal reasoning (0 tokens)

Because nothing is ever deleted (retraction **archives**), you can query the past. See
**[Provenance & re-verification](/en/fact-provenance)**.

- **`valueAsOf(s, p, at)`** — the value **at a given date**.
- **`factAsOf(s, p, at)`** — the value at that date, the current value, and a "changed" flag.
- **`historyOf(s, p)`** — the full **timeline** of successive values (with their intervals).
- **`statusOf(s, p, o)`** — `fresh` / `stale` / `unknown` per a freshness policy.

## 8. Natural-language questions — DeterministicQA (0 tokens)

**`deterministicAnswer(kb, text)`** recognizes **precise** question families and answers them
**without an LLM**: class count ("how many customers?"), aggregate ("average age?"), history ("history
of Marie"), and **as-of** questions ("where did Alice live in 2023?"). Returns `null` if the question
matches no pattern → it then **escalates** to RAG/LLM.

## 9. Causal & narrative reasoning — PlotReasoner (0 tokens)

Follow **cause** and **order** links between events. See **[Plot reasoning](/en/plot-reasoning)**.

- **`why(event)`** — traces back to **root causes** (all causal chains).
- **`consequencesOf(event)`** — the downstream **closure** of consequences.
- **`timeline()`** — the **order** of events (topological sort; a cause always before its effect).
- **`incoherences()`** — flags **incoherent** plots (an effect dated before its cause).

## 10. Proactive reasoning — InsightEngine (0 tokens)

Reason **without being asked**: sweep the base for what deserves attention. See
**[Proactive deduction](/en/insight-reasoning)**.

- **`findContradictions(s)`** — detects that a fact and its **negation** coexist.
- **`InsightEngine.scan()`** — produces **alerts** (contradiction, narrative incoherence, anomaly =
  counterexample of a near-rule, gap = a missing attribute the class mostly has, stale facts) and
  **suggestions** (similar entities, inherited facts). Each insight has a stable key (deduplication
  across sweeps).

## 11. Verification & freshness — FactVerifier (0-token mechanical)

**`FactVerifier.verify(s, p, o)`** re-checks **one** fact by routing it to its source's channel
(originating tool, web, injected reverifier…): verdict `confirmed` (freshness re-stamped),
`contradicted` (old archived, new written) or `unknown`. **`sweep()`** runs the pass in batch (curator
agent). **Secret** or **locked** (🔒) facts are never re-verified, by design. The mechanism is 0-token;
a reverifier may itself call an external source.

## 12. Structural analogy — PathAlgebra (0 tokens)

**`PathAlgebra.analogy(a, b, c)`** solves "A is to B as C is to…?" at the level of **path structure**
(the bit transform of A→B, replayed on C) — a purely structural analogy, with no semantics or LLM.

## 13. Hybrid LLM ↔ QPath reasoning — PingPong (LLM, grounded)

When no deterministic path succeeds, we call the model — **but fenced in**. See
**[PingPong reasoning](/en/pingpong-reasoning)**.

**`PingPongReasoner.run(question)`** runs a short exchange (3 rounds max by default) where, each round,
the LLM plays **one** move: `ASK` (QPath answers with a chain), `HYPOTHESIS` (QPath **verifies** —
anti-hallucination), `TOOL` (external tool call), or `CONCLUDE`. QPath returns a **deterministic**
verdict; the LLM therefore cannot assert a fact the base contradicts. Cost: a few LLM calls; the
verifications stay at 0 tokens.

> 🔒 **Grounding.** That's the key difference: the LLM **proposes**, QPath **disposes**. Verified
> hypotheses can be written back into the base (and become free at the next question).

## 14. Operation vocabulary — QpathOps (0 tokens)

**`runQpathOp(kb, "verb:args")`** is a small **DSL** exposing the modes above as compact commands
(`ask:`, `inverse:`, `intersect:`, `compare:`, `similar:`, `classes:`, `inherit:`, `num:`, `agg:`,
`forall:`, `exists:`, `why:`, `consequences:`, `timeline:`…). It powers the benchmark, the remote memory
API, and the PingPong `TOOL` move.

---

## What about flow execution?

**`FlowRunner`** ([Factflow](/en/dynamic-behavior)) is **not** a reasoning mode but an **action
executor**: a control flow (if/then, switch, bounded loop) stored as facts. Its **conditions**, however,
are 0-token QPath lookups — so it relies on the reasoning above to decide, then acts.

> In short: QPath is **correct by construction** (deterministic reasoning covers the vast majority of
> questions, at 0 tokens) **and** augmented with intelligence **on demand** (the LLM, grounded, for the
> open-ended) — all **auditable** (every conclusion carries its chain and provenance).
