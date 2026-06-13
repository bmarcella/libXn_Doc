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
(`libxn_ledger_movement`), and the vector index (`libxn_embedding`, `vector` column + HNSW index).

## Reference implementations (in memory)

The core ships **in-memory** adapters, zero dependencies: test double, offline mode, and an
**executable specification** of the expected behavior — notably the ACID of `tx()`.

Three references, one per port: `InMemoryKbStore`, `InMemoryFactStore`, `InMemoryVectorStore`
(exact cosine search — the behavior pgvector reproduces at scale via HNSW).

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
