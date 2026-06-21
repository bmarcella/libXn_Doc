# Semantic search & vectors

QPath answers first by **exact deduction** (0 tokens). But when a question is **vague** or worded
differently from memory ("who pleaded guilty?" vs the stored fact), you search **by meaning**: turn
texts and facts into **vectors** and find the closest ones. The core depends on no vector database — it
enters through a **port**.

> 💡 **Complementary, not competing.** Symbolic (exact facts) and semantic (meaning proximity) combine:
> you keep the precision of triples **and** the recall of a fuzzy search.

## Vectorize text

`SemanticVectorizer` turns text into a 384-D vector (MiniLM/e5 model), **fully in-browser** (Web
Worker, no API key). It distinguishes **query** from **document** (asymmetric models).

```ts
import { SemanticVectorizer } from '@damba/libxn-embeddings';

const v = SemanticVectorizer.getInstance();
await v.ensureReady();                              // loads the model (idempotent, cached)

const docVec = await v.embed('Paris is the capital of France', 'passage');  // 384 numbers
const qVec   = await v.embed('Where is Paris?', 'query');
const many   = await v.embedBatch(['…', '…'], 'passage');                    // efficient batch
```

- **`getInstance()` / `ensureReady(onProgress?)`** — singleton + lazy model load.
- **`embed(text, usage?)` → `Promise<number[]>`** — text → vector; `usage` = `'query'` or `'passage'`.
- **`embedBatch(texts, usage?)` → `Promise<number[][]>`** — many texts in one round-trip.

## Index & search facts by meaning

`VectorGridStore` links QPath memory to a vector database. **Index** readable facts, then **search**
with a natural-language question.

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));

// Index facts (s,p,o) → embeddings.
await store.syncSemanticFacts('case-1', [
  { s: 'jeremy mongrain', p: 'pleaded', o: 'guilty' },
  { s: 'paul', p: 'is', o: 'lawyer' },
], v /* the SemanticVectorizer */);

// Search by meaning.
const hits = await store.searchSemantic('case-1', 'who pleaded guilty?', v, 5);
//    → [{ score: 0.89, text: 'jeremy mongrain pleaded guilty', … }]
```

- **`syncSemanticFacts(key, facts, embedder, onProgress?)` → `Promise<{count}>`** — embed facts and
  store them under a key (per project/case).
- **`searchSemantic(key, query, embedder, limit?)` → `Promise<…>`** — embed the question + return the
  closest facts (score 0 to 1).
- **`save(key, snapshot)` / `load(key)`** — persist/reload a full grid snapshot.

## The `VectorStore` port — Qdrant or Postgres

The engine talks to an **interface**; plug in the implementation you want.

```ts
// Qdrant (REST, no SDK)
import { QdrantVectorStore } from '@damba/libxn-qdrant';
const q = new QdrantVectorStore('http://localhost:6333');
await q.ensureCollection('facts', 384);
await q.upsert('facts', [{ id: 1, vector: qVec, payload: { text: '…' } }]);
const near = await q.search('facts', qVec, 10);

// Postgres + pgvector (same interface)
import { makeSql, pgVectorStore } from '@damba/libxn-postgres';
const pg = pgVectorStore(makeSql(process.env.DATABASE_URL!));
```

- **`ensureCollection(name, size)`** — create the collection if absent. **`upsert(coll, points)`** —
  insert/update points `{ id, vector, payload }`. **`search(coll, vector, limit?)`** — the k nearest
  (cosine). Same methods for Qdrant **and** pgvector — the app picks the backend.

## Use cases

| Situation | How |
|---|---|
| **RAG**: retrieve relevant facts for a prompt | `syncSemanticFacts` then `searchSemantic` |
| Reworded question, typos, synonyms ("doc" ≈ "doctor") | search by meaning (embeddings) |
| Detect duplicates / synonyms across entities | compare two `embed()` (high cosine) |
| Everything local, no API key | `@damba/libxn-embeddings` (MiniLM in a Web Worker) |

> 🔎 **Recommended order.** Try the **exact read** first (`kb.ask`, reasoning — 0 tokens), and fall back
> to **semantic** only if nothing is found: precision first, recall second.
