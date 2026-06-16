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
| **Write** (`tell`, `retract`, `confirm`, `edit`) | **always** to the primary layer; parents stay intact |
| **Enumerations** (subjects, predicates…) | **union** of all layers, deduplicated, priority to the specific |
| **Reasoning** (`reason`, inheritance, Plot, Insight, rules, flows) | operates over the **whole stack**, transparently |

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
