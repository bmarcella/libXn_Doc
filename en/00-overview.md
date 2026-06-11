# Overview

QPath is a **content-addressable symbolic memory**: a single graph structure that stores, indexes,
retrieves and reasons — with no language model at its core, **deterministically and at zero token**.

::: info LibXN & QPath
**QPath** is the primitive: the graph structure and its reasoning. **LibXN** is the library that
implements it and surrounds it with an ecosystem (visualization, vector persistence, LLM bridges). In
short: QPath = the core; LibXN = the core plus its tools. The `@damba/libxn` package is that core,
standalone.
:::

👉 Concretely: see the **[use cases](use-cases)** (AI agent memory, knowledge graph, recommendation,
explainable reasoning, offline/sovereign…) with code examples.

## What it does

- **Fact memory** — stores relations (subject, predicate, object); direct or inverse queries,
  intersections/unions, comparisons, similarity.
- **Reasoning** — traced forward and backward chaining (inheritance, transitivity, declared compositions),
  + modes that combine QPath with an LLM: [Flash reasoning](flash-reasoning) and
  [PingPong reasoning](pingpong-reasoning).
- **Lightweight learning** — regression and classification from examples, no expensive training.
- **Multi-modal** — text, numbers and tabular data converge into the same structure.

## Why it's different

- **Deterministic** — same inputs → same results, every time. No hallucination.
- **Auditable & editable** — the memory is a graph you can read, fix and version.
- **Zero-token, real-time** — queries are near-instant and cost no model call.
- **Sovereign** — everything can run locally; no data leaves.

## Proof (built-in benchmark)

On the reference scenarios: **100% recall (28/28) · ~0.07 ms per query**. Exact retrieval, rule
cascades, multi-variable joins, numeric comparisons (>, <, between), aggregates
(count/sum/avg/min/max) and quantifiers (forall/exists) — deterministic, at 0 tokens.

## Integrations

The core is **isomorphic and dependency-free** (Node, browser, Web Worker). Optional building blocks
(3D visualization, Qdrant-style vector search, embeddings) plug in via adapters — see
[Architecture](04-guides/architecture).

---

::: tip Note
QPath's internals (encoding, formal specification) are not published here. For technical access or a
partnership, contact the author.
:::
