# The packages — what they do, and when to use them

QPath is a minimal **core** (`@damba/libxn`) surrounded by **optional** packages, each plugged in through
**ports** (interfaces) rather than hard dependencies. You install only what you need: everything else stays
decoupled, and the core runs on its own, with no network and no browser.

> 💡 **Simple rule.** Start with `@damba/libxn`. Add a package when you have a precise need (drive an LLM,
> persist, encode an image, render in 3D…). The "adapter" packages (Postgres, Qdrant, Redis) implement a
> core port: you swap them without touching the rest.

## Core

| Package | What it does | When to use it | Env |
|---|---|---|---|
| **`@damba/libxn`** | QPath symbolic memory: `(subject, predicate, object)` facts, deterministic reasoning (inheritance, multi-hop, contradictions), temporal, rules, flows. Headless. | **Always.** It is the foundation. | universal |

## LLM, agents & tools

| Package | What it does | When to use it | Env |
|---|---|---|---|
| **`@damba/libxn-tools-llm`** | [Catalog of 230 tools](/en/tool-catalog), provider-agnostic, exposing all of QPath's surface. | Let **any LLM** drive QPath via function calling. | universal |
| **`@damba/libxn-agents`** | [RAG + agents](/en/agents): multi-source Retriever, LLM orchestrator, QPath DSL, agents (curator, researcher, tutor). | Build a **chat/agent** grounded on QPath with retrieval. | universal |
| **`@damba/libxn-intent`** | [Intent router](/en/intent-routing): semantic (structure + trigrams), 0 token by default. | Decide **what a message wants** before handling it. | universal |

## Learning & deduction

| Package | What it does | When to use it | Env |
|---|---|---|---|
| **`@damba/libxn-generative`** | [Grounded generative deduction](/en/generative-deduction): analogy, inheritance, synthesis, with **quarantine** (nothing is written without validation). | Generate/deduce plausible **new facts**, under control. | universal |
| **`@damba/libxn-qpath-ml`** | [Entity memory](/en/entity-memory) (VSA similarity) + [trainable networks](/en/qpath-ml) (MLP/Directional/GridNet) + [fact routing](/en/fact-routing). | "Who is similar to X?", guess a trait, learn on the **directional representation**. | universal |

## Input & encoding

| Package | What it does | When to use it | Env |
|---|---|---|---|
| **`@damba/libxn-encoders`** | [Perceptual encoders](/en/encoders): multi-resolution image, audio/spectrogram → QPath bits. | Memorize **image/audio** in the same graph as text. | browser |
| **`@damba/libxn-embeddings`** | [Semantic embeddings](/en/semantic-search), local (MiniLM via Web Worker), 384 dims. | **Semantic search** by meaning, with no network call. | browser |

## Output & UI

| Package | What it does | When to use it | Env |
|---|---|---|---|
| **`@damba/libxn-visualization`** | [3D rendering](/en/visualization) with Three.js (implements the `GridView` port). | **Explore/debug** the memory, highlight a reasoning path. | browser |
| **`@damba/libxn-react-ui`** | [Fact-driven UI](/en/fact-driven-ui): screen and behavior described as QPath facts, rendered by React. | Build a UI **whose state lives in the memory**. | browser |

## Persistence & infrastructure

| Package | What it does | When to use it | Env |
|---|---|---|---|
| **`@damba/libxn-postgres`** | [Postgres/pgvector adapters](/en/persistence) for the KbStore, FactStore (ACID), VectorStore, MediaStore ports. | **Persist** durably on the server (Neon/Postgres). | server |
| **`@damba/libxn-qdrant`** | Qdrant adapter for the `VectorStore` port. | Store **vectors** in Qdrant for semantic search. | server |
| **`@damba/libxn-cache`** | `Cache` port (get/set/getOrCompute) + adapters (memory, Redis); [decorates](/en/caching) embeddings/search/LLM/snapshots. | **Cache** expensive operations (fail-open). | universal |
| **`@damba/libxn-cache-redis`** | **ioredis** adapter for the `RedisLike` port of `libxn-cache`. | **Distributed** cache (multi-process) via Redis. | server |

## Maturity

The whole suite is **pre-1.0** (v0.1.x) and not yet published on npm: packages are consumed locally (the
monorepo). Indicative maturity levels:

- **Solid**: `@damba/libxn` (core) — the read/reasoning surface is characterized by hundreds of tests,
  measured 100% recall up to 400,000 facts.
- **Stable, young API**: `libxn-postgres`, `libxn-cache`, `libxn-intent`, `libxn-generative`,
  `libxn-qpath-ml`, `libxn-tools-llm` — tested, but the API may move before 1.0.
- **Browser / periphery**: `libxn-encoders`, `libxn-embeddings`, `libxn-visualization`, `libxn-react-ui`
  — functional, environment-dependent (Canvas/WebGL/Worker/React).

> In practice: build on the **core** without reservation; for peripheral packages, pin the version and
> expect small API adjustments before 1.0.

## Choose in one sentence

- **Just memory and reasoning**: `@damba/libxn` alone.
- **An LLM-driven assistant**: + `libxn-tools-llm` (or `libxn-agents` for full RAG).
- **Multimodal** (image/audio/meaning): + `libxn-encoders` and/or `libxn-embeddings`.
- **In production**: + `libxn-postgres` (persistence) and `libxn-cache` (+ `-redis` for multi-process).
- **To see/debug**: + `libxn-visualization`.
