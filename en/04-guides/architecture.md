# Architecture — core vs periphery

## Principle

QPath is treated as a **reusable primitive**. The `@damba/libxn` package contains only what is
**framework-agnostic and dependency-light**: zero Angular, zero Three.js, zero network, zero app
service. Its only runtime footprint is **none** (`dependencies: {}`).

## What is in the core

```
@damba/libxn
├── core      BinaryConverter · XNeurone · XNeuroneGrid · PathVectorizer
├── encoders  SemanticEncoder · TabularEncoder
├── symbolic  KnowledgeBase · PredicateAlgebra · ChainResolver · RuleEngine · NaturalParser
├── vector    VectorStore (port) · TextEmbedder (port) · VectorGridStore (hybrid logic)
└── datasets  BenchScenarios · HousingDataset · IrisDataset · Benchmark
```

## What stays in the periphery (sub-packages)

| Lot | Modules | Why outside the core |
|---|---|---|
| Visualization **✅ extracted** | `XNeuroneVisualizerForGrid` → `@damba/libxn-visualization` | Three.js + DOM |
| Vector DB **✅ extracted** | Qdrant adapter → `@damba/libxn-qdrant`; **pgvector** on the Damba backend (the `VectorStore` port + `VectorGridStore` + `InMemoryVectorStore` are **in the core**) | REST / SQL client |
| Persistence **✅ ports in the core** | `KbStore` / `FactStore` / `SchemaMigrator` (+ `DurableKnowledgeBase`, `InMemory*`, `CachingKbStore`); Postgres adapters on the backend | Postgres / pgvector — see [Persistence](/en/persistence) |
| Embeddings | `SemanticVectorizer`, `embedding.worker` | `@huggingface/transformers`, Web Worker |
| Perceptual encoders | `PerceptualEncoder`, `AudioEncoder` | canvas DOM |
| Agents & LLM | `Agent`, `*Agent`, `LLMOrchestrator` | LLM API |

## The dependency-inversion pattern

The core must never import a heavy layer. When it needs a peripheral service, it **defines an
interface** and **receives the implementation by injection**. Two examples already shipped:

- **Rendering** — `interface GridView` + `static XNeuroneGrid.viewFactory`. The host registers
  `XNeuroneGrid.viewFactory = (door) => new XNeuroneVisualizerForGrid(door)`. `three` never enters the
  core.
- **Vector DB** — `interface VectorStore`. Any adapter (`QdrantVectorStore`, a future pgvector/Pinecone
  one) implements it and is passed to `VectorGridStore`.

## Why this boundary

- **The core tests without a browser** (vitest/Node) — proof of reusability.
- **The periphery stays optional** — a consumer pays only for what it uses.
- **The structure above is public; the core's internals are not** (technical access on request).
