# Layers — layered memory

`LayeredKnowledgeBase` stacks several memories **read as one**, from the most **specific** to the
most **generic**:

```
💬 conversation  →  👤 user  →  🏢 organization  →  🌐 generic
   (overlay)                                          (base)
```

Single rule: **most specific wins**, per `(subject, predicate)`. A single layer receives the
**writes** (the primary); the layers below are **read-only**. And since everything goes through the
same primitives, **reasoning operates over the whole stack without knowing it**.

## What it's for

- **Dev / prod**: prod as the base (read-only), a **dev overlay** where you test new facts — without
  touching prod (see [Dynamic behavior](dynamic-behavior)).
- **Multi-tenant**: **default values** at the organization level, **overridden** per user. No one
  duplicates the defaults; each writes only their exceptions.
- **Conversation context**: what is said in the current exchange lives in the topmost layer, on top
  of the user's and the organization's durable knowledge.
- **Personalization / preferences**: a user setting shadows the default, for that setting only.

## How the stack resolves

| Operation | Behavior |
|-----------|----------|
| **Read** of a `(subject, predicate)` | the **first layer** that knows this pair answers; lower layers are not consulted for that pair |
| **Write** (`tell`, `retract`, `confirm`, `editFact`) | **always** to the primary layer; parents stay intact |
| **Enumerations** (subjects, predicates…) | **union** of all layers, deduplicated, priority to the specific |
| **Reasoning** (`reason`, inheritance, Plot, Insight, rules, flows) | operates over the **whole stack**, transparently |

And it isn't only the raw facts: the **flags** (decided/load-bearing), the **secret** facts (Vault), the
**companion** facts (profiles/sections), **group access control**, **temporal** queries ("back then it was
X") and the symbol hooks all propagate **across every layer** — each resolved on the layer that actually
carries the fact. In other words, Vault, companions and permissions work even when you reason over the
dev/prod stack, not only over a plain base.

This is exactly the **inheritance-with-exceptions** philosophy: a specific layer **shadows** the base
for the pairs it knows, and lets it show through everywhere else.

## In practice

```ts
import { XNeuroneGrid, KnowledgeBase, LayeredKnowledgeBase } from '@damba/libxn';

// Shared base (organization / generic) — stable
const base = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await base.tell('config', 'theme', 'sombre');     // organization default
await base.tell('tweety', 'est', 'oiseau');

// Specific overlay (user / conversation)
const overlay = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const kb = new LayeredKnowledgeBase(overlay, [base]);  // [specific, …, generic]

// Read: the whole stack, most specific wins
kb.ask('config', 'theme');     // ['sombre']  ← inherited from the base
kb.reason('tweety', 'est');    // reasons over the WHOLE stack

// Write: always to the overlay; parents are read-only
await kb.tell('config', 'theme', 'clair');   // THIS user's preference
kb.ask('config', 'theme');     // ['clair']   ← the overlay shadows the base
base.ask('config', 'theme');   // ['sombre']  ← the base stays intact
```

### The functions in this example, argument by argument

**`new XNeuroneGrid(undefined, { headless: true })`** — builds the in-memory QPath graph that backs each `KnowledgeBase`.

- `encoder?` (1st arg, here `undefined`): the encoder that turns a value into bit pairs. Optional — `undefined` keeps the **default encoder** (`BinaryConverter.toBinaryPairs`), which handles primitives/arrays/objects. Pass it only for a custom encoding.
- `opts?` (2nd arg, here `{ headless: true }`): `{ headless?: boolean }`. `headless: true` = **no rendering** (Node/server); no Three.js view is attached. By default (`headless` absent/`false`), the grid tries to attach the renderer registered via `XNeuroneGrid.viewFactory` if one exists. In a layered context you are **always headless**: the grid is merely a working memory.

**`new KnowledgeBase(grid)`** — wraps a grid to expose the fact model (`tell`/`ask`/`reason`…).

- `grid` (only argument, required): the `XNeuroneGrid` that carries the graph. If the grid pre-exists (a reloaded snapshot), the constructor **rebuilds its indices** on the way in. A `KnowledgeBase` = a grid + an index/reasoning layer.

**`new LayeredKnowledgeBase(primary, parents?)`** — stacks several `KnowledgeBase`s read as one.

| Argument | Role | Default |
|---|---|---|
| `primary` | the **write** layer (the most specific — conversation/user). **All** writes (`tell`, `retract`, `confirm`, `editFact`) land here. | — (required) |
| `parents?` | the **read-only parent** layers, ordered **from most to least specific** (`[user, organization, generic]`). The effective stack is `[primary, ...parents]`. | `[]` (no parent layer) |

> 💡 A `LayeredKnowledgeBase` **is** a `KnowledgeBase` (it extends it): pass it anywhere a KB is expected. Its own internal grid is headless and empty — every method that touches the graph is overridden to query the stack.

**`await base.tell('config', 'theme', 'sombre')`** — records a `(subject, predicate, object)` fact.

| Argument | Role | Default |
|---|---|---|
| `s` | the fact's **subject** | — (required) |
| `p` | the **predicate** (the relation) | — (required) |
| `o` | the **object** (the value) | — (required) |
| `source?` | the **provenance** (`{ kind, ref?, at?, confidence? }`) — where the fact comes from (`user`, `document`, `web`, `tool`…) | — (no provenance) |
| `flags?` | the **flags** (`{ closed?, major?, secret?, group?, companionOf? }`) — decided 🔒, load-bearing ⭐, secret 🔑, access group, companion fact | — (no flags) |

> On a `LayeredKnowledgeBase`, `tell` always routes to `primary` — the parents stay intact. The return value is `Promise<ContradictionReport | null>`: `null` if all is well, otherwise a report describing the direct contradiction detected at write time.

**`kb.ask('config', 'theme')`** — reads the values of a `(subject, predicate)` pair.

- `s` (required): the subject to look up.
- `p` (required): the predicate to look up.

Returns a `string[]`: the list of known objects for that pair (empty if none). On the stack, the **first layer** that knows the pair answers (most specific wins); lower layers are not consulted for that pair.

**`kb.reason('tweety', 'est')`** — reasons over the whole stack (direct facts + transitive/inheritance chains).

| Argument | Role | Default |
|---|---|---|
| `s` | the starting subject | — (required) |
| `p` | the predicate to follow | — (required) |
| `depth?` | maximum chain depth (number of transitive hops explored) | `3` |
| `visited?` | internal set of already-visited subjects (cycle guard) — recursive use, **do not pass** in a normal call | `new Set()` |

Returns a `ReasoningChain | null`: `null` if there is no conclusion; otherwise `{ steps, conclusion: { s, p, o }, confidence, via }` where `via` is `'direct'` (fact found as-is) or `'transitive'` (derived through a chain), and `confidence` is the minimum of the steps' confidences ("the chain is only as strong as its weakest link").

> The same `kb` object is passed to `reason`, `PlotReasoner`, `InsightEngine`, `RuleEngine`,
> `FlowRunner`… : they reason over the stack with no special code. That's polymorphism — a
> `LayeredKnowledgeBase` **is** a `KnowledgeBase`.

## Best practices

- **Order from most specific to most generic**: `[conversation, user, organization, generic]`. The order **decides who wins**.
- **Write to the right layer**: volatile and personal on top; shared defaults in the base (through their own channels and rights). Don't pollute the generic with specifics.
- **Shadowing ≠ merging**: for a `(subject, predicate)`, the specific layer **replaces** the base (it does not merge objects). If you want the **union** of several values, keep them in **the same** layer.
- **Keep the lower layers stable and curated**; concentrate churn in the overlay.
- **Isolate per account / tenant**: one overlay per user or tenant; **never** share the top layer across accounts (reset it on account switch) — anti cross-account leak.
- **Shallow stacks**: each read probes layers until it finds a match; avoid needless stacking.
- **Dev → prod cycle**: test in the overlay, then **promote** the validated facts to the base (tagged release, reversible) — see [Dynamic behavior](dynamic-behavior).

## When to use it

| Situation | Layers? |
|-----------|---------|
| A single memory, a single scope | no — a plain `KnowledgeBase` is enough |
| Shared defaults + local overrides | **yes** |
| Test facts without impacting prod | **yes** (dev overlay) |
| Conversation context on top of the durable one | **yes** |

> ⚠️ Writes through the layered handle **always** land in the primary — you never write a parent
> layer this way (they have their own channels and rights).
