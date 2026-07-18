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
| **Regression** | a **numeric value** from features, **under a confidence gate** | 0 | estimate a price from learned characteristics |
| **Classification** | a **class** from features, **under a confidence gate** | 0 | type an entity from its profile |

All modes are **0 tokens** as long as known facts are deduced. Only **filling** a missing link may call
an external source — and only if the host has wired one in.

> 🎯 **Confidence gate.** Regression and classification are **approximate** (memory is non-injective).
> They return a value **only** if uncertainty is below a threshold (samples, dispersion, margin);
> otherwise they emit **nothing** rather than a doubtful result. Uncertainty detection is built in, not
> optional.

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

## API in practice

The `DeductiveGenerator` is instantiated over a `KnowledgeBase`. The external gap resolver (web…) is
**injected** — absent, generation is **fully offline and deterministic**.

```ts
import { KnowledgeBase, XNeuroneGrid } from '@damba/libxn';
import { DeductiveGenerator, type GapResolverPort } from '@damba/libxn-generative';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('main.ts', 'compile_to', 'main.js');
await kb.tell('util.ts', 'compile_to', 'util.js');
await kb.tell('socrates', 'is', 'human');
await kb.tell('human', 'has', 'reason');

// EXTERNAL gap resolver (web…) — LAST resort. Absent ⇒ offline, 0 tokens, 0 network.
const resolver: GapResolverPort = {
  async resolve(gap) {
    if (gap.kind === 'fact' && gap.s === 'tokyo' && gap.p === 'country') {
      return [{ s: 'tokyo', p: 'country', o: 'japan', confidence: 0.88, ref: 'https://…' }];
    }
    return [];
  },
};

const gen = new DeductiveGenerator(kb, { resolver, seed: 'demo' });

// 1) Structural analogy — deduces "app.js" from the known examples.
const a = await gen.analogize('app.ts', 'compile_to');
//    → { items: ['app.js'], trace: [{ via: 'analogy', detail: '…' }] }

// 2) Inheritance — attribute inherited from the class (with exceptions).
await gen.inherit('socrates', 'has');              // → { items: ['reason'], … }  (via "human")

// 3) Synthetic data — from LEARNED distributions, reproducible with a fixed seed.
gen.synthesize({ fields: [{ name: 'city', predicate: 'city' }] }, 5);

// 4) GROUNDED gap-fill → QUARANTINE → HUMAN promotion.
await gen.analogize('tokyo', 'country');           // gap filled via the resolver (memory first)
gen.pendingPromotions();                           // → [{ s:'tokyo', p:'country', o:'japan', confidence:0.88, ref }]
kb.ask('tokyo', 'country');                        // → []      (NOTHING in prod before validation)
await gen.promote('tokyo', 'country', 'japan');    // ← HUMAN action
kb.ask('tokyo', 'country');                        // → ['japan']  (promoted, with provenance)
```

> To also search ingested documents and org/user memory before the web, pass concrete KBs as
> `parents`, and a `scope` for RBAC: `new DeductiveGenerator(kb, { parents, scope, resolver, seed })`.

## Function reference

Each function is described with its **signature**, its **parameters** and an **example**.

### Build the generator — `new DeductiveGenerator(kb, options?)`

| Parameter | Type | Default | Role |
| --- | --- | --- | --- |
| `kb` | `KnowledgeBase` | — | Working memory (conversation + ingested documents). Its **grid** powers recombination and completion. |
| `options.parents` | `KnowledgeBase[]` | `[]` | **Extra** rings searched by pure deduction BEFORE the web (user, org, generic, packs memory). **Concrete** KBs. |
| `options.scope` | `GenerationScope` | allow all | **Authorization (RBAC)** + **domain isolation**: filters every fact read/emitted/filled. |
| `options.gapFlags` | `FactFlags` | `{}` | Flags (`group`/domain) stamped on **filled** facts → they stay scoped once promoted. |
| `options.resolver` | `GapResolverPort` | — | **External** source (web…), injected. **Last resort.** Absent ⇒ fully offline, deterministic. |
| `options.seed` | `string \| number` | constant | Reproducibility **seed** (same seed → same output). |
| `options.maxGaps` | `number` | `8` | Cap on **external calls** over the generator's lifetime. |

```ts
const gen = new DeductiveGenerator(kb, {
  parents: [userKb, orgKb],
  scope: composeScopes(groupScope({ allowedGroups: ['chem-team'] }), domainScope({ domain: 'chemistry' })),
  gapFlags: { group: 'chem-team' },
  resolver: webResolver,
  seed: 'report-2026',
});
```

### The common result — `GenResult`

Every generation function returns **the same shape**:

```ts
interface GenResult<T> {
  items: T[];               // the produced elements
  trace: DeductionStep[];   // WHY each element was produced
  gapsFilled: FilledGap[];  // links filled (quarantined, pending validation)
  pendingGaps: Gap[];       // gaps NOT filled (resolver absent / exhausted)
}
interface DeductionStep {
  via: 'direct' | 'approx' | 'inherited' | 'analogy' | 'recombination'
     | 'regression' | 'classification' | 'gap-filled';
  fact?: { s: string; p: string; o: string };  // the fact used
  detail?: string;                              // human-readable explanation
}
```

### `analogize(s, p)` — deduce by structural analogy

Deduces the object of `(s, p)` when it is a **structural transformation** of the subject. Internal
order: direct read → approximate resolution → analogy → external fill.

| Parameter | Type | Role |
| --- | --- | --- |
| `s` | `string` | The **subject** whose object you want (e.g. `'contract.pdf'`). |
| `p` | `string` | The **predicate** / relation (e.g. `'export_to'`). |

**Returns:** `Promise<GenResult<string>>` — `items` = the deduced object.

```ts
await kb.tell('invoice.pdf', 'export_to', 'invoice.csv');
await kb.tell('quote.pdf',   'export_to', 'quote.csv');

const r = await gen.analogize('contract.pdf', 'export_to');
r.items;          // → ['contract.csv']
r.trace[0].via;   // → 'analogy'
```

### `inherit(s, p)` — deduce by class inheritance

Walks the classes of `s` (`est`/`subclass_of`…) and returns the **inherited** attribute `p`, honoring
**exceptions** (a closer `not_p` blocks a farther `p`).

| Parameter | Type | Role |
| --- | --- | --- |
| `s` | `string` | The **instance** (e.g. `'socrates'`). |
| `p` | `string` | The **attribute** sought (e.g. `'has'`). |

**Returns:** `Promise<GenResult<string>>` — `items` = inherited values.

```ts
await kb.tell('socrates', 'is',  'human');
await kb.tell('human',    'has', 'reason');

const r = await gen.inherit('socrates', 'has');
r.items;          // → ['reason']     (via 'inherited', decided by "human")
```

### `recombine(seed, options?)` — recombine real values

Emits **really stored values** along learned paths (grounded, seedable walk). Never fabricates a value.

| Parameter | Type | Default | Role |
| --- | --- | --- | --- |
| `seed` | `unknown` | — | Starting point (locates the grid zone). |
| `options.steps` | `number` | `8` | Number of elements to emit. |
| `options.temperature` | `number` | `1` | `<1` favors frequent paths, `>1` explores more. |
| `options.constraint` | `(v) => boolean` | — | Filter: a rejected element is not emitted. |

**Returns:** `GenResult` (synchronous).

```ts
const r = gen.recombine('report', { steps: 5, temperature: 0.7 });
```

### `complete(partial, options?)` — complete / vary a seed

Completes a **partial** input (via grid prediction) and can produce **variants**.

| Parameter | Type | Default | Role |
| --- | --- | --- | --- |
| `partial` | `unknown` | — | The seed to complete. |
| `options.variants` | `number` | `0` | Number of extra variants (seeded walks). |
| `options.steps` | `number` | `4` | Length of each variant. |

**Returns:** `GenResult` (synchronous).

```ts
const r = gen.complete('config.pro', { variants: 3 });
```

### `synthesize(schema, n)` — generate plausible data

Produces `n` rows where each field is **sampled from the real distribution** learned for its predicate
— same values, same proportions as memory. Reproducible with a fixed seed.

| Parameter | Type | Role |
| --- | --- | --- |
| `schema` | `{ fields: { name: string; predicate: string }[] }` | Columns: `name` = output name, `predicate` = learned predicate. |
| `n` | `number` | Number of rows to generate. |

**Returns:** `GenResult<Record<string, string>>` — `items` = the rows.

```ts
await kb.tell('p1', 'city', 'paris');
await kb.tell('p2', 'city', 'paris');
await kb.tell('p3', 'city', 'lyon');

const r = gen.synthesize({ fields: [{ name: 'city', predicate: 'city' }] }, 100);
// 100 rows { city: 'paris' | 'lyon' }, ~2/3 paris — like memory
```

### `resolveSynonym(term)` — find an alias (on demand)

Looks for an **alias** (`same_as`) of the term: known aliases first (0 tokens), otherwise external fill
→ quarantine. Triggered **explicitly** by the host (never automatically).

| Parameter | Type | Role |
| --- | --- | --- |
| `term` | `string` | The term to reconcile (e.g. `'ai'`). |

**Returns:** `Promise<GenResult<string>>` — `items` = aliases.

```ts
await kb.tell('ai', 'same_as', 'artificial_intelligence');
const r = await gen.resolveSynonym('ai');
r.items;          // → ['artificial_intelligence']
```

### `regress(features)` / `classify(features)` — predict under a confidence gate

Predict a **numeric value** (`regress`) or a **class** (`classify`) from a **feature** vector, via a
`Predictor` wired to a **trained feature grid** (≠ the triplet memory). The result is **approximate**:
it is emitted **only** if confidence exceeds the thresholds, otherwise `items` is **empty** — the trace
explains why.

| Item | Type | Role |
| --- | --- | --- |
| `options.predictor` | `Predictor` | Required for both modes. Wraps the feature grid + confidence **thresholds**. |
| `features` | `unknown` | The feature vector (encoded with the **same** encoder used at training). |

**Returns:** `GenResult<number>` / `GenResult<string>` — `items` = `[value]` / `[class]` if **confident**, else `[]`.

```ts
import { Predictor } from '@damba/libxn-generative';

const predictor = new Predictor(featureGrid, {           // trained grid (train / trainClass)
  encoder,                                               // SAME encoder used at training
  regression:     { minSamples: 3, maxRelStdDev: 0.15 }, // uncertainty thresholds
  classification: { minProbability: 0.7, minMargin: 0.2 },
});
const gen = new DeductiveGenerator(kb, { predictor });

gen.regress(features).items;   // → [value] if reliable, else []
gen.classify(features).items;  // → [class] if reliable, else []
```

### `verify(s, p, o)` — check a candidate against memory (noise filter)

Checks, by **pure deduction (0 tokens)**, whether a candidate fact `(s, p, o)` is **supported**,
**contradicted** or **unknown** with respect to already-anchored knowledge. **Conservative**: it only
calls "contradicted" on **strong signals** (explicit negation, uniqueness constraint, a different
**locked** 🔒 value) — never on a mere absence (a multi-valued predicate often has several legitimate
objects). Used to **filter the noise** of a bulk extraction before writing.

| Parameter | Type | Role |
| --- | --- | --- |
| `s`, `p`, `o` | `string` | The candidate fact to check. |
| `options.support` | `boolean` | `true` (default) also computes **support** (analogy/inheritance); `false` keeps only contradiction detection (cheaper bulk-ingestion gate). |

**Returns:** `VerifyVerdict` — `{ outcome: 'supported' | 'contradicted' | 'unknown', deduced, conflict?, reason, trace }`.

```ts
await kb.fact('earth', 'shape', 'round').closed().save();   // decided value 🔒

gen.verify('earth', 'shape', 'round').outcome;  // → 'supported'   (already known)
gen.verify('earth', 'shape', 'flat').outcome;   // → 'contradicted' (different locked value)
gen.verify('mary', 'likes', 'pears').outcome;   // → 'unknown'      (multi-valued → keep)
```

### `EntityClassifier` — deduce an entity's class from its profile

Infers the **class** of an entity from its **profile** (the predicates it carries), with no explicit
`est`/`is` fact. It **learns** a feature grid on the corpus's **already-typed** entities (profile ⇒
class), then **proposes** a class for untyped ones — **under a confidence gate**. No writing: proposals
are **candidates to validate** (same spirit as quarantine).

| Method | Signature | Role |
| --- | --- | --- |
| `train(kb)` | `(kb): Promise<{ trained, labels }>` | Learns profile ⇒ class on **typed** entities (accumulable across KBs). |
| `proposeUntyped(kb)` | `(kb): EntityClassProposal[]` | **Proposes** a class for each untyped entity, confidence-gated. |
| `classify(features)` | `(string[]): EntityClassProposal \| undefined` | Classifies a standalone trait profile. |

```ts
import { EntityClassifier } from '@damba/libxn-generative';

const ec = new EntityClassifier({ thresholds: { minProbability: 0.6, minMargin: 0.15, minSamples: 2 } });
await ec.train(kb);                        // learns from "jean is person", "acme is company"…
const props = ec.proposeUntyped(kb);
// → [{ entity: 'paul', label: 'person', probability, margin, samples, reason }]  (to validate)
```

### Human validation — `pendingPromotions()`, `promote(...)`, `reject(...)`

A **filled** (web) fact lands in **quarantine**: it powers generation but only enters the reference
memory on a **human decision**.

| Function | Signature | Role |
| --- | --- | --- |
| `pendingPromotions()` | `(): PendingPromotion[]` | Lists quarantined facts (`{ s, p, o, confidence, ref? }`). |
| `promote(s, p, o)` | `(s, p, o: string): Promise<boolean>` | **Validate**: copies the fact into memory (provenance + group kept), removes it from quarantine. |
| `reject(s, p, o)` | `(s, p, o: string): boolean` | **Reject**: removes from quarantine without promoting. |

```ts
await gen.analogize('tokyo', 'country');         // fills via the resolver → quarantine
gen.pendingPromotions();                          // → [{ s:'tokyo', p:'country', o:'japan', confidence:0.88, ref }]
await gen.promote('tokyo', 'country', 'japan');   // ← the human validates
// or: gen.reject('tokyo', 'country', 'japan');   // ← the human refuses
```

### The external port — `GapResolverPort`

**You** decide where missing pieces come from (web, another base…). The package holds no URL or key.

```ts
interface GapResolverPort {
  resolve(gap: Gap): Promise<GapCandidate[]>;
}
interface Gap          { kind: 'synonym' | 'inheritance' | 'fact'; s?: string; p?: string; o?: string; context?: string[]; }
interface GapCandidate { s: string; p: string; o: string; confidence: number; ref?: string; }
```

### Scope policies — `groupScope`, `domainScope`, `composeScopes`

Build the `scope` passed to the generator (see "Authorization & isolation" below).

| Function | Parameters | Role |
| --- | --- | --- |
| `groupScope({ allowedGroups?, allowPublic? })` | allowed groups; public allowed by default | **RBAC**: a fact is used only if its group is allowed; no group = public. |
| `domainScope({ domain, domainOf?, allowMajorBridge?, allowUndomained? })` | target domain; how to read the domain; ⭐ bridge; undomained facts | **Isolation**: stays within `domain`; a ⭐ `major` fact may bridge. |
| `composeScopes(...scopes)` | several policies | **AND**: a fact must satisfy **all** policies. |

```ts
const scope = composeScopes(
  groupScope({ allowedGroups: ['chem-team'], allowPublic: true }),
  domainScope({ domain: 'chemistry' }),
);
```

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
| **Ingest a large text without polluting it** — drop contradicted facts, type entities | `verify` (noise filter) + `EntityClassifier` (proposed classes), all **to validate** |
| Estimate a value / type from features, **only if reliable** | `regress` / `classify` **under a confidence gate** |

### Concrete scenarios (with code)

**A. Deduce a build's output filename** — the app knows a few examples, deduces the rest:

```ts
await kb.tell('main.ts', 'compile_to', 'main.js');
await kb.tell('app.ts',  'compile_to', 'app.js');

const out = await gen.analogize('worker.ts', 'compile_to');
out.items;        // → ['worker.js']   (deduced, not guessed)
```

**B. Complete an entity record from its class** — what we know of the class flows to the instance:

```ts
await kb.tell('customer', 'has', 'address');
await kb.tell('customer', 'has', 'email');
await kb.tell('acme',     'is',  'customer');

const fields = await gen.inherit('acme', 'has');
fields.items;     // → ['address', 'email']   (inherited from "customer")
```

**C. Build a realistic test dataset** — same values and proportions as the real data:

```ts
for (const [u, role] of [['u1','admin'],['u2','member'],['u3','member'],['u4','member']]) {
  await kb.tell(u, 'role', role);
}
const set = gen.synthesize({ fields: [{ name: 'role', predicate: 'role' }] }, 1000);
// 1000 rows { role } ; ~75% "member", ~25% "admin" — reproducible (fixed seed)
```

**D. Extend a business glossary — org first, web last, human validation**:

```ts
const gen = new DeductiveGenerator(kb, {
  parents: [orgKb],                                // search the org memory first
  scope: groupScope({ allowedGroups: ['my-org'] }),// RBAC: nothing from another org
  gapFlags: { group: 'my-org' },                   // a filled fact stays attached to the org
  resolver: webResolver,                           // last resort only
});

const def = await gen.analogize('sku', 'means');
if (def.gapsFilled.length) {
  // came from the web → quarantined ; a human decides
  gen.pendingPromotions();                         // → [{ s:'sku', p:'means', o:'…', ref }]
  await gen.promote('sku', 'means', def.items[0]);
}
```

> ❌ **When not to use it.** For **fluent free prose**, that's not the goal (see below): the strength is
> the **structured, the deductive and data**.

## Authorization & contextual isolation (RBAC)

Grounded deduction **only ever accesses what the user is allowed to see**, at every level. Security is
set **by construction** then reinforced by a **scope policy**:

- **Partitioning by construction** — the engine reads ONLY the layers it is handed (conversation,
  documents, **user**, **org**, shared memory). Another **organization's** memory, never being handed
  in, can **never** appear. Server-side, those layers already contain only the **authorized** facts
  (per-group permissions).
- **RBAC by group** — each fact may belong to an access **group**. Generation uses a fact only if its
  group is **authorized**; facts with **no group** are **public**. "Only the public knowledge provided
  by QPath is accessible to everyone": you can restrict to *public only*.
- **Contextual isolation (domain)** — to avoid **mixing disjoint domains** (chemistry ≠ maths),
  generation stays **within its context**. A fact from another domain is pulled in only if it carries a
  **⭐ major (structural) link** — the only allowed bridge between domains.
- **Scoped fill** — an externally fetched fact is **tagged to the current context** (group/domain)
  before entering quarantine, and **stays scoped** once promoted; a candidate that would fall out of
  scope is **rejected**.

These rules apply **uniformly across all modes** (direct, analogy, inheritance, synonym, synthesis,
fill). As a result, a generation is always **logical, scoped and authorized** — no fact from an
unauthorized group, organization or domain can "leak" into an output.

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
