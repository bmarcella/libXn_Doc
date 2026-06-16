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
