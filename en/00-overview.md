# Overview

QPath is a **deterministic symbolic memory**: it stores facts, **retrieves them exactly and reliably at
scale**, and **reasons** over them — with no language model at its core, at **zero token**, in an
**auditable and temporal** way.

> **The Damba thesis.** Beyond memory: **an application's behavior IS governed facts** — flows,
> rules, limits, fraud checks live in facts you query, govern and evolve **at runtime, without
> redeploying**, deterministically and traceably. See **[Factflow](dynamic-behavior)** and the
> **[ledger](transaction-ledger)** showcase (`npm run example:ledger`).

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
- **Auditable & editable** — the memory can be read, fixed and versioned, fact by fact.
- **Zero-token, real-time** — queries are near-instant and cost no model call.
- **Sovereign** — everything can run locally; no data leaves.

## Proof (built-in benchmark)

On the reference scenarios: **100% recall (37/37) · ~0.07 ms per query**. Exact retrieval, rule
cascades, multi-variable joins, numeric comparisons (>, <, between), aggregates
(count/sum/avg/min/max), quantifiers (forall/exists) and **inheritance with exceptions**
("a penguin is a bird but does not fly" — the "no" is proven, not guessed) — deterministic,
at 0 tokens. The memory also detects **contradictions at write time**, can **induce its own rules** from its
regularities (support, confidence, counterexamples) under human validation, and reasons over the
**plot** of events ([Plot Reasoning](plot-reasoning): root causes, consequences, timeline,
incoherences). Finally, [proactive deduction](insight-reasoning) anticipates and alerts without
being asked: contradictions, violated near-rules, missing data. And identity is first-class:
merged aliases, **separated homonyms** ("two Jeans" don't contradict each other — they get
told apart), splitting with preserved provenance. QPath also offers an [access layer](access-layer) for developers: encrypted secret facts, authentication via an injected port, guards, and transactional facts (append-only ledger).

## Integrations

The core is **isomorphic and dependency-free** (Node, browser, Web Worker). Optional building blocks
(3D visualization, pgvector/Qdrant vector search, embeddings) plug in via adapters — see
[Architecture](04-guides/architecture).

---

::: tip Note
QPath's internals (encoding, formal specification) are not published here. For technical access or a
partnership, contact the author.
:::
