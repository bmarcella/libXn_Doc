# The geometry of knowledge

Most AI systems store knowledge as **fuzzy numbers**: weights spread across huge matrices, learned by
training, impossible to read one by one. QPath makes the opposite choice: knowledge has a **place**. Each
element occupies a determined position in a space that **grows on demand**. This is what we call the
geometry of knowledge, and it is the source of most of QPath's properties.

## A place, not a weight

In a statistical model, "dog" exists nowhere in particular: it is diluted across millions of coefficients.
In QPath, a term, a fact, a relation each have an **identifiable position**. You can point at it, read it,
explain it. Nothing is diluted, so nothing is fuzzy.

Two immediate consequences:

- **Determinism.** The same input always lands in the same place. No sampling, no temperature, no
  randomness: the same question twice, the same answer twice.
- **Auditability.** Since everything has an address, you can always answer "where did this answer come
  from?" by showing the path taken, not an opaque probability.

## A space that grows

A classic network has a size **fixed in advance**: a parameter count chosen at design time, filled by
training. QPath's space has no fixed size. It **extends as** new knowledge arrives, exactly where needed,
without touching the rest.

- **No prior training.** You add a fact, it takes its place. Nothing to re-optimize.
- **No catastrophic forgetting.** Adding new knowledge does not distort the old: existing places do not
  move. It is the opposite of a model you must retrain, risking overwriting what it knew.

## Addressing by content

Because an element's position derives from **its content**, two systems that never communicated place the
same knowledge in the same spot. This is the principle of **content addressing**: a thing's identity IS its
place. The [lexkey](/en/lexkey) package takes this idea all the way for words — a stable address, identical
everywhere, that lets you **merge two memories without coordination**.

Content addressing also explains why retrievals are **instant and free**: you don't search, you go straight
to the place. No tokens, no model call.

## Reasoning is composing paths

If facts are places, relations are **paths** between them. Reasoning is then not matrix multiplication but
**following and composing paths**: "Paris is in France, France is in Europe, so Paris is in Europe" reads
as a journey, step by step. That is why every conclusion comes with its trace: the path IS the explanation.

> **What the geometry brings, in one sentence.** Giving each thing a place makes memory deterministic,
> auditable, extensible without training, and mergeable by content. Reasoning becomes a traceable
> movement, not an opaque prediction.

## Going further

- [Why QPath](/en/why-qpath) — what this approach fixes compared to an LLM alone.
- [Discrete knowledge](/en/discrete-knowledge) — when this geometry is the right tool.
- [Compact memory (lexkey)](/en/lexkey) — content addressing applied to word identity.
- [3D visualization](/en/visualization) — watch the knowledge space unfold.
