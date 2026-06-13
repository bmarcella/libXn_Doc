# Persistence

QPath keeps its working memory **in memory** (the graph is fast), but *durability* is delegated to
**ports** — exactly like the LLM, search, or vector services. The core defines **what to store**
and **what the storage must guarantee**; never *how*. Adapters (Postgres today, CockroachDB or a
Redis cache tomorrow) implement these ports.

> Consequence: switching databases touches **no business code** — only an adapter (new tech) or a
> decorator (cache). Same philosophy as every other LibXN port.

## Three granularities, three ports

```ts
import type { KbStore, FactStore, SchemaMigrator } from '@damba/libxn';
```

### `KbStore` — symbolic memory (snapshot)

Persists the whole memory (the graph + its provenance: sources, flags, history) as a **per-scope
snapshot**. Simple, durable, multi-device.

```ts
interface KbStore {
  load(scope: string): Promise<KbSnapshot | null>;
  save(scope: string, snapshot: KbSnapshot): Promise<void>;
  clear(scope: string): Promise<void>;
  append?(scope: string, event: KbEvent): Promise<void>; // optional incremental (journal)
}
```

### `FactStore` — row-level system of record + ACID

For facts that **require** ACID: money in the [ledger](/en/transaction-ledger), secrets and
permissions in the [access layer](/en/access-layer). `tx()` is the **transactional boundary** — what
makes a transfer truly atomic at the database (commit if everything succeeds, rollback otherwise).

```ts
interface FactStore {
  get(scope: string, s: string, p?: string): Promise<FactRow[]>;
  put(scope: string, row: FactRow): Promise<void>;
  retract(scope: string, s: string, p: string, o: string, reason: string): Promise<void>;
  setFlags(scope: string, s: string, p: string, o: string, flags: FactFlags): Promise<void>;
  tx<T>(fn: (t: FactTx) => Promise<T>): Promise<T>; // ← ACID
}
```

### `VectorStore` — semantic index

Already documented: similarity search. **pgvector** becomes just an adapter for it (it replaces a
dedicated vector database — one fewer system to operate).

## Schema auto-initialization

LibXN **owns its schema**: it declares its tables (`LIBXN_SCHEMA`, all prefixed `libxn_`,
database-agnostic) and **materializes them at initialization**. The adapter is the only thing that
speaks SQL — a future CockroachDB reuses the same schema.

```ts
import { initLibxnSchema, LIBXN_SCHEMA } from '@damba/libxn';

// At init (server bootstrap): create/align the libxn_* tables, idempotent.
await initLibxnSchema(myMigrator);
```

`LIBXN_SCHEMA` declares the snapshot (`libxn_kb_snapshot`), the row-level facts
(`libxn_fact` / `libxn_fact_source`, with temporal archive), the append-only ledger
(`libxn_ledger_movement`), and the generic vector table (`libxn_vector`: `collection`, `id`, a
**dimension-free** `vector` column, `payload`). Search is exact cosine; an HNSW index (which
requires a fixed dimension) is a future optimization reserved for fixed-size collections.

## Reference implementations (in memory)

The core ships **in-memory** adapters, zero dependencies: test double, offline mode, and an
**executable specification** of the expected behavior — notably the ACID of `tx()`.

Three references, one per port: `InMemoryKbStore`, `InMemoryFactStore`, `InMemoryVectorStore`
(exact cosine search — the same behavior as the pgvector adapter).

```ts
import { InMemoryKbStore, InMemoryFactStore } from '@damba/libxn';

const facts = new InMemoryFactStore();
await facts.tx(async (t) => {
  await t.put('account', debitRow);   // leg 1
  await t.put('account', creditRow);  // leg 2
}); // if a leg throws → rollback: no partial write survives
```

Any durable adapter (Postgres…) must behave **like** these references.

## Durable KB (`DurableKnowledgeBase`)

An **opt-in** subclass of `KnowledgeBase` that backs it with a `FactStore` (the core stays
persistence-free). This makes EVERYTHING built on the KB durable — facts, plus the
[access layer](/en/access-layer) (secrets, permissions) and the [ledger](/en/transaction-ledger).

```ts
import { DurableKnowledgeBase } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, scope);
await kb.hydrate();                       // replays durable facts in memory (at startup)
await kb.tell('alice', 'role', 'admin');  // write-through → FactStore
await kb.flush();                         // await durable writes

// DB-level atomicity: fn's writes go into ONE transaction (commit/rollback).
await kb.transaction(async () => {
  await kb.tell('a', 'balance', '300');
  await kb.tell('b', 'balance', '200');
});
```

- **Hydration**: `getAll(scope)` → in-memory replay. The KB is the query engine; the FactStore is
  the durable truth (*cache + write-through* pattern).
- **Write-through**: every mutation is mirrored (serial queue, `flush()` to await).
- **Transaction**: `TransactionLedger` uses it automatically (atomic `transfer` at the DB when the
  KB is durable); otherwise in-memory compensation, unchanged. **Opt-in, zero regression.**

## Deep dive

### The two-tier model

QPath separates the **working model** (the in-memory graph, fast) from the **durable truth** (the
store). The KB answers queries and reasons; the store keeps facts beyond the process.

```
        write                                  read (at startup)
  app ──tell──▶ in-memory KB ──write-through──▶ FactStore ──hydrate()──▶ in-memory KB
                (queries, reasoning)            (Postgres, truth)        (rebuilt)
```

Two granularities, two uses:

| | `KbStore` (snapshot) | `FactStore` (row-level) |
|---|---|---|
| Shape | one JSONB blob per scope (grid + provenance) | one row per fact + its provenance |
| For | general symbolic memory, RAG, reasoning | access layer: money, secrets, permissions |
| Strengths | simple, one coherent photo | SQL-queryable, **transactional (ACID)** |

### The data model

| Table | Contents |
|---|---|
| `libxn_kb_snapshot` | per-scope snapshot: `grid` (jsonb) + `provenance` (jsonb) + `updated_at` |
| `libxn_fact` | one fact: `scope, id, s, p, o, flags, created_at` + archive (`retracted_at/_reason`) |
| `libxn_fact_source` | provenance: 1 fact → N sources (`kind, ref, at, confidence, display`) |
| `libxn_ledger_movement` | **append-only** movements (never `UPDATE`/`DELETE`) |
| `libxn_vector` | vectors: `collection, id, v` (free dimension), `payload` |

The fact `id` is the deterministic hash of the normalized triplet (`factId`); two identical
assertions converge on the same row (deduplication).

### Write path (write-through)

Every mutation feeds a **serial queue** of durable writes (order preserved):

- `tell` (async) awaits the enqueue then returns; `flush()` awaits the queue draining. Durability
  is thus **eventual** until `flush()` — a database error surfaces *at flush*, not at the write.
- For **strict** durability after a critical operation: `await kb.flush()` (this is what
  `LedgerService` does after each deposit/withdraw/transfer).

### Read path (hydration)

At startup, `getAll(scope)` replays durable facts into the KB. After that, **all reads are
in-memory** (the store is no longer hit). Cost: O(facts in scope) on first access — hence
reasonably sized scopes (per user / organization / conversation).

### Transactions & guarantees

- `transaction(fn)` groups the **async** writes (`tell`) of `fn` into one FactStore transaction
  (commit/rollback). **Sync** mutations (`retract`/`setFlags`) done during `fn` are **not** in the
  transaction — they go through the normal queue.
- On rollback the FactStore is restored; **in-memory** consistency is the caller's job
  (compensation, or re-hydration). `TransactionLedger` covers this (in-memory compensation).

### Limits to know

- **Eventual durability** by default (use `flush()` for certainty).
- **Snapshot blob** capped (10 MB on the backend): for large volumes, prefer the row-level
  `FactStore`, and eventually an **incremental journal** (`KbStore.append`, upcoming write-model).
- **Concurrency**: a single process writes in memory for a given scope; not designed for concurrent
  multi-process writes on the same scope without external coordination.
- **Non-persisted policy**: some *in-memory* config (e.g. the ledger's velocity limits) does not
  live in the store; balance, floor/ceiling, currency and movements are durable.

## Scaling path

| Step | Tech | What you write |
|---|---|---|
| **Start** | PostgreSQL + pgvector | `Pg*` adapters (one service: relational + vector) |
| **Read cache** | Redis | a **decorator** around a port — no caller changed |

The cache decorator already exists (`CachingKbStore`): wiring Redis = replacing its internal `Map`
with a Redis client, nothing else.

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore); // cache-first reads, write-through writes
```

| **Distributed scale** | CockroachDB | subclass of the Postgres adapter (compatible protocol) |

> Persistence lives server-side (Postgres). On the client, memory flows through the backend — there
> is no more browser storage (IndexedDB removed). **Vector search** too: the client computes the
> embedding (MiniLM) then queries **pgvector via the backend** — no more direct access to an
> external vector database.
