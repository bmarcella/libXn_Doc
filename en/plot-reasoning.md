# Plot Reasoning

A reasoning mode over the **plot**: **events**, their **order** and their **causes**. Where the
knowledge base reasons over timeless facts ("a penguin is a bird"), Plot Reasoning works on
**situated** facts:

```
negligence causes spark
spark causes fire
fire causes alarm
fire causes evacuation
alarm precedes evacuation
```

The plot of a narrative, an investigation file, an incident history — rebuilt from ordinary facts,
queryable deterministically, **at 0 tokens**.

## What it can do

| Question | Mechanism | Example |
|----------|-----------|---------|
| "What led to X?" | walk back to the **root causes** | `negligence —causes→ spark —causes→ fire —causes→ evacuation` |
| "What did X end up causing?" | unroll the **causal closure** | the spark eventually causes fire, alarm, evacuation |
| "In what order?" | **timeline** (topological sort over order + causality) | negligence → spark → fire → alarm → evacuation |
| Suspicious plot | **incoherence** detection | a "cause" proven to come after its effect, or a **purely causal cycle** (an effect that re-causes its own cause), is flagged — only once |
| "Who? Why?" | declared actors and motives of events | `evacuation actor guard · motive safety` |

Every answer carries its **event chain as proof** — the "why" is auditable, like everything else
in the memory.

## The API in practice

The `PlotReasoner` is built **on top of a `KnowledgeBase`**: it stores nothing itself, it *reads* the
facts already present. You pass it the KB and — optionally — the list of predicates that act as causal /
order edges.

```ts
import { PlotReasoner, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('negligence', 'causes', 'spark');
await kb.tell('spark', 'causes', 'fire');
await kb.tell('fire', 'causes', 'evacuation');
await kb.tell('alarm', 'precedes', 'evacuation');

// undefined = default encoder; headless = no rendering (Node/server).
const plot = new PlotReasoner(kb);   // 2nd argument (options) omitted → default conventions
```

The **two constructor arguments**:

- **`kb`** (`KnowledgeBase`, required) — the memory to interpret. The `PlotReasoner` reads its facts via
  `ask` / `askInverse`; it never mutates the KB.
- **`opts`** (`PlotOptions`, optional — `{}` by default) — which predicates count as edges, and how far
  to walk. Details below.

### The options (`PlotOptions`)

```ts
const plot = new PlotReasoner(kb, {
  causePredicates: ['cause', 'causes', 'leads_to'],   // replaces the default list
  orderPredicates: ['precedes', 'before'],            // replaces the default list
  maxDepth: 12,                                        // longer chains
});
```

| Argument | Role | Default |
|---|---|---|
| `causePredicates?` | the predicates read as **causal edges** (cause → effect). The list **replaces** the default one entirely (it is not added to it); values are compared lowercased. | `['cause', 'causes', 'provoque', 'entraîne', 'entraine', 'déclenche', 'declenche']` |
| `orderPredicates?` | the predicates read as **order edges** (a before b), used for the timeline and incoherence detection. Also replaces the default list, compared lowercased. | `['précède', 'precede', 'precedes', 'avant', 'before']` |
| `maxDepth?` | maximum depth of the causal chains walked back / unrolled — a bounded guard that guarantees termination on large graphs. | `8` |

> 💡 **Replaces, does not extend.** Passing `causePredicates: ['leads_to']` means `cause` is **no
> longer** recognized. To extend the defaults, copy them into your list (`['cause', 'causes', 'leads_to']`).

### `why(event)` — walk back to the root causes

```ts
const chains = plot.why('evacuation');
// chains[0].events  → ['negligence', 'spark', 'fire', 'evacuation']
```

- **`event`** (`string`, required) — the event whose causes are sought. It is normalized (case /
  accents via `kb.normalize`) before the search, so `'Evacuation'` and `'evacuation'` match.

**Returns: `PlotChain[]`** — *all* causal chains walking from `event` back to a **root** cause (an event
with no known cause), sorted by descending `confidence` then ascending length. **Empty** array if the
event has no known cause. Each `PlotChain` is `{ events, steps, confidence }`:

| Field | Meaning |
|---|---|
| `events` | the events in **cause → effect** order (the last is the queried event) |
| `steps` | the edges traversed (`{ s, p, o, count, confidence }`) — the auditable **proof** |
| `confidence` | chain confidence = the **minimum** of its edges' confidences (every asserted causal edge counts as `1`) |

### `consequencesOf(event)` — unroll the consequences

```ts
const cons = plot.consequencesOf('spark');
const reached = cons.map(c => c.events[c.events.length - 1]);
// → ['fire', 'evacuation', …]  (forward causal closure)
```

- **`event`** (`string`, required) — the event whose **forward causal closure** is unrolled: everything
  it ends up causing, directly or in cascade. Normalized like `why`.

**Returns: `PlotChain[]`** — one chain per reached consequence (breadth-first traversal, each node
visited once, bounded by `maxDepth`). Same shape as `why`.

### `timeline()` — the chronology

```ts
plot.timeline();
// → ['negligence', 'spark', 'fire', 'alarm', 'evacuation']
```

No argument. **Returns: `string[]`** — *all* the events of the plot, sorted by **topological sort**
combining order edges **and** causal edges (a cause precedes its effect). On ties, the order is
**alphabetical** (deterministic). Nodes caught in a cycle cannot be ordered: they are appended **at the
end** (and flagged by `incoherences()`).

### `incoherences()` — the plot defends itself

```ts
await kb.tell('evacuation', 'causes', 'alarm');   // ?! alarm precedes evacuation
plot.incoherences();
// → [{ cause: 'evacuation', effect: 'alarm', reason: '…' }]
```

No argument. **Returns: `PlotIncoherence[]`** — the plot's contradictions, each
`{ cause, effect, reason }` (`reason` = a readable sentence explaining the conflict). Two families are
detected: (1) a causal edge whose **proven** order is reversed (the effect precedes the cause via order
edges); (2) a **purely causal cycle** (an effect that re-causes its own cause). Each contradiction is
**deduplicated per unordered pair** → reported **only once**. Empty array if the plot is sound.

### `actorsOf(event)` / `motivesOf(event)` — who, and why

```ts
plot.actorsOf('evacuation');   // ['guard']
plot.motivesOf('evacuation');  // ['safety']
```

- **`event`** (`string`, required) — the event whose declared actors / motives are read.

**Returns: `string[]`** — the declared values. `actorsOf` reads the predicates `acteur` **and** `actor`;
`motivesOf` reads `motif` **and** `motive` (bilingual, hard-coded). Empty array if nothing is declared.

### `PlotReasoner.format(chain)` — render a chain readable

```ts
PlotReasoner.format(plot.why('fire')[0]);
// → 'negligence —causes→ spark —causes→ fire  (confidence 1.00)'
```

**Static** method. **`chain`** (`PlotChain`, required) — the chain to format. **Returns: `string`** — a
readable line `s —p→ o …  (confidence X.XX)`, or `'(empty plot)'` if the chain has no edge.

### The `runQpathOp` DSL — without instantiating the reasoner

For a one-off call (router, LLM tool), `runQpathOp` instantiates the `PlotReasoner` internally and
returns only the **flat list of events**:

```ts
import { runQpathOp } from '@damba/libxn';

runQpathOp(kb, 'why:evacuation');     // → ['negligence', 'spark', 'fire']
runQpathOp(kb, 'consequences:spark'); // → ['fire', 'alarm', 'evacuation']
runQpathOp(kb, 'timeline:');          // → the full chronology
```

The **two arguments**:

- **`kb`** (`KnowledgeBase`, required) — the memory to query.
- **`op`** (`string`, required) — the operation as `verb:argument`. For the plot: `why:<event>`,
  `consequences:<event>`, `timeline:` (empty argument). The `:` is mandatory even when the argument is
  empty (`'timeline:'`).

**Returns: `string[]`** — the list of events (without chains/proof). `why:` returns all events involved
in the chains leading to the target (the target itself excluded); `consequences:` the final events
reached; `timeline:` the chronology. For the **proof** (chains, confidence), instantiate the
`PlotReasoner` directly.

## Conventions

Everything is an ordinary triplet; only the **predicates** are conventional (and configurable):

- `causes` / `cause` / `triggers` — causal edges;
- `precedes` / `before` / `avant` — order edges;
- `actor`, `motive` — who acts, and why.

One semantic detail that matters: an event that causes **two** things weakens neither — every
asserted causal edge is a full fact (confidence does not dilute across the consequences of a same
event).

## Where events come from

The reasoning is 100% deterministic; **extracting** events from prose is the job of an extractor
(human, or an LLM with an event schema). The provenance of every edge always says **who asserted
the causality** — a cause *asserted by a text* is never confused with a *proven* one.

## When to use it

| Situation | Recommended mode |
|-----------|------------------|
| Properties, classes, attributes ("who is what") | classic symbolic deduction |
| Question decomposable in one pass | Flash reasoning |
| Open-ended reasoning validated step by step | PingPong |
| **Narratives, post-mortems, case files: "why", "what led to", "in what order"** | **Plot Reasoning** |
