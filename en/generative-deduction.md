# Grounded generative deduction

QPath does not generate content by *sampling* a model — it generates by **deducing** from what it
already knows. The `@damba/libxn-generative` package adds a layer of **generation-by-reasoning** on top
of memory: everything it produces is **grounded** in real facts, **traced** (you know *why* each piece
was produced), and **deterministic** (same seed → same output). Pure QPath: **0 tokens, no network
dependency** in the core.

> 💡 **The principle.** Content is not *invented*, it is **deduced** from existing facts (recombination,
> analogy, inheritance). When a link is missing (a synonym, an inheritance edge, a fact), the engine
> goes and **fetches the missing piece** — via an **injected** external source (web…) if needed —
> **validates** it, writes it to **quarantine**, then **resumes** deduction. Promotion into the
> reference memory remains a **human validation**.

## Why "grounded", not just "generative"

Free, on-the-fly generation produces *unverifiable* plausibility. Grounded deduction does the opposite:

- **Grounding** — every emitted element is a **really stored value** or a conclusion **deduced** from
  real facts. No invention.
- **Auditability** — each output carries its **deduction trace**: direct read, analogy, inheritance,
  recombination, or a filled-in link (and from which source).
- **Determinism** — a **reproducible** random source (a seed) makes any generation replayable
  identically. Essential to test, compare, certify.
- **Constrained** — generation leans on memory; what is **decided** (🔒) or **structural** (⭐) weighs
  more.

It is the opposite of a "box that writes": it is a **box that deduces, and shows its reasoning**.

## Generation modes

| Mode | Deduces… | Cost | Example |
| --- | --- | --- | --- |
| **Recombination** | new sequences of **real values** along learned paths | 0 | recomposes from ingested content |
| **Analogy** | a fact's object by **structural transformation** (A:B :: C:?) | 0 | `main.ts → main.js` ⇒ `app.ts → app.js` |
| **Inheritance** | an attribute **inherited from a class** (with exceptions) | 0 | "Socrates is human; humans have reason" ⇒ Socrates has reason |
| **Completion** | the **continuation** of a partial input + variants | 0 | completes / varies a seed |
| **Synthetic data** | **plausible** rows following the learned distributions | 0 | test sets respecting real proportions |
| **Synonym (on demand)** | an **alias** of a term | 0 (local) or external | "ai" ≡ "artificial intelligence" |

All modes are **0 tokens** as long as known facts are deduced. Only **filling** a missing link may call
an external source — and only if the host has wired one in.

## Filling missing links — memory first, web last

When deduction **stalls** (no value for `(subject, predicate)`, unknown parent class, synonym needed),
the engine does **not** rush to the web. It first looks for the missing piece, by **pure deduction
(0 tokens)**, across **all the knowledge it can reach**, from most specific to broadest:

1. the **conversation** and **ingested documents**;
2. the **user's** memory;
3. the **organization's** memory;
4. the **shared knowledge / packs**.

Direct read, inheritance, analogy, approximate resolution and synonyms **traverse all these layers**
before any external call. **Only** if none of these sources knows does the engine reach for an
**external source injected by the host** (e.g. a web search). The core knows nothing about that source:
it enters through a **port**, never a dependency — the package stays portable and deterministic.

The fetched candidate **never** touches the reference memory directly:

1. it is **normalized and validated** (same rules as ingestion: no empty/incoherent term);
2. it is **deduplicated** against what is already known;
3. it is written to **quarantine** (a throwaway overlay), with its **provenance**, and **never** marked
   "decided" (it stays re-verifiable);
4. generation uses it to continue;
5. **a human then validates**: *promote* (the fact joins the reference memory) or *reject*.

> 🔒 **Guardrail.** The number of external calls is **bounded**, the reference memory is enriched only
> by an **explicit human decision**, and each filled-in fact keeps the URL/identifier of its source —
> auditable and purgeable.

## Examples

**1. Structural analogy** — generate by transformation, from known examples:

```
main.ts  compile_en  main.js
util.ts  compile_en  util.js
```
`analogize("app.ts", "compile_en")` → **app.js** *(via analogy, confidence 1.00)*

**2. Inheritance** — an attribute deduced from the class (with exceptions):

```
socrates  is   human
human     has  reason
```
`inherit("socrates", "has")` → **reason** *(inherited from "human", distance 1)*

**3. Synthetic data** — plausible rows, never invented, following the **real proportions**:

```
p1 city paris · p2 city paris · p3 city lyon
```
`synthesize({ city }, 5)` → 5 rows where `city ∈ {paris, lyon}` in the same proportions as memory —
**reproducible** with a fixed seed.

**4. Grounded fill — memory first, web last** — `analogize("tokyo", "country")`:

- if an **ingested document** or the **org/user** memory already holds "Tokyo → Japan" → **direct
  answer, 0 tokens, no web**;
- otherwise the engine queries the external source → candidate `tokyo country japan` placed in
  **quarantine** (web provenance, never "decided") → a human **promotes** (the fact joins memory) or
  **rejects**.

**5. Synonym on demand** — `resolveSynonym("ai")` → **artificial_intelligence** (`same_as` alias): read
from memory if known, otherwise filled then promoted by a human.

> Every output comes back with its **trace**: `direct` / `approx` / `inherited` / `analogy` /
> `recombination` / `gap-filled` — you always know *why* a piece was produced.

## Use cases

| Situation | What grounded deduction brings |
|-----------|--------------------------------|
| Derive coherent variants/skeletons from examples (code, configs, labels) | deterministic **structural analogy** |
| Complete a record/entity from similar entities | **inheritance** + **analogy** |
| Build realistic test/demo datasets **without inventing** | **synthetic data** (learned distributions) |
| Extend knowledge of a topic, leaning first on **documents** and **org/user** memory, web only if needed | **grounded fill** → quarantine → human promotion |
| Reconcile terms (synonyms/aliases) | `resolveSynonym` (`same_as`) |

> ❌ **When not to use it.** For **fluent free prose**, that's not the goal (see below): the strength is
> the **structured, the deductive and data**.

## Determinism & reproducibility

The generative walk relies on an **injectable** random source: with no seed, the usual behavior; with a
seed, the output is **identical on every run**. In offline mode (no external source wired), a generation
is therefore **100% reproducible** — making it a testable, certifiable building block, where classic
sampling is not.

## Where it fits

It is the **generative** counterpart of the [reasoning types](/en/reasoning-types): the same facts, the
same grid, but this time to **produce** something new rather than only answer. Generation follows the
same order as the whole pipeline: **pure deduction first** (direct read → approximate resolution →
analogy → inheritance), external source **as a last resort**, and everything stays **traced**.

> Fluent prose generation is deliberately **not** the goal: the strength of grounded deduction is the
> **structured, the deductive and data** — something new that you can **explain**.
