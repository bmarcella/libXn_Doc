# Persistence

QPath keeps its memory **in memory** (the graph is fast) and delegates *durability* to **ports**.
Practical upshot: you choose where to store without changing your business code — an adapter in
tests, Postgres in production, a Redis cache tomorrow, all by injection.

## Durable KB (`DurableKnowledgeBase`)

The main use case: make your `KnowledgeBase` **durable** by backing it with a `FactStore`. Everything
built on it — facts, [ledger](/en/transaction-ledger), [access layer](/en/access-layer) (secrets,
permissions) — becomes persistent **without touching the rest of your code**.

```ts
import { DurableKnowledgeBase, InMemoryFactStore, XNeuroneGrid } from '@damba/libxn';

// undefined = default encoder ; headless = no rendering (Node/server). The graph = working memory.
const grid = new XNeuroneGrid(undefined, { headless: true });
const factStore = new InMemoryFactStore();                    // WHERE to persist (see "Create a store")
const kb = new DurableKnowledgeBase(grid, factStore, `user:${userId}`);

await kb.hydrate();                        // at startup: reload durable state
await kb.tell('alice', 'role', 'admin');  // persisted automatically (write-through)
await kb.flush();                         // ensure it's written before moving on
```

The three arguments: the **grid** (the in-memory QPath graph), the **`factStore`** (where facts are
actually persisted — see just below), and the **scope** (the key that isolates this memory, e.g.
`user:42`).

And an **atomic transfer** (commit if all succeeds, rollback otherwise):

```ts
await kb.transaction(async () => {
  await kb.tell('a', 'balance', '300');
  await kb.tell('b', 'balance', '200');
});
```

> `TransactionLedger` uses this **automatically**: build it on a durable KB and `transfer` becomes
> atomic at the database, with no change to your ledger code.

## Save / load a memory (`KbStore`)

To simply snapshot a memory and reload it (RAG, general memory), without per-fact management:

```ts
await store.save(scope, kb.grid.serialize());  // save
const snapshot = await store.load(scope);      // reload (or null)
await store.clear(scope);                      // erase
```

## Which store for which need

| Port | Use it for | Strength |
|---|---|---|
| **`KbStore`** | general memory, RAG, reasoning | simple — one coherent photo per scope |
| **`FactStore`** | access layer: money, secrets, permissions | **transactional (ACID)** via `tx()` |
| **`VectorStore`** | similarity search (semantic, paths) | orthogonal — see [Components](/en/components) |

## Create a store

A **store** is the object that actually persists data; it's what you pass to `DurableKnowledgeBase`
(the `factStore`) or use on its own (a `KbStore`). The core only defines the *interfaces*
(`FactStore`, `KbStore`); the implementation depends on where you want to store.

> ❓ **Which database? How does it connect?** LibXN **doesn't know — and doesn't need to.** It only
> sees the interfaces. The **database type and the connection are YOURS**: you create the client
> (with your connection string), wrap it in an adapter, and pass it to LibXN. That's what keeps the
> core dependency-free and portable (Postgres, MySQL, SQLite, in-memory…).

**In tests or offline — shipped by the core, zero config:**

```ts
import { InMemoryFactStore } from '@damba/libxn';

const factStore = new InMemoryFactStore();   // all in RAM, behaves like production
```

**In production — a durable adapter.** You write **a single small file** that (1) opens the
connection to your database, (2) creates the tables (`initLibxnSchema`), (3) translates the
`FactStore` interface to SQL. It's the **only** code specific to your database; nothing else moves.

👉 **Complete, copy-pasteable** example below: [The `FactStore` in production (Postgres)](#the-factstore-in-production-postgres).

### Where to initialize it: once, at startup

The `factStore` is created **once**, at your app's boot, in a dedicated module; then all your code
reuses **that same instance** (it's the `factStore` in every example on this page). Never recreate it
per request.

```ts
// persistence.ts — your app's setup, run once at startup
import postgres from 'postgres';
import { DurableKnowledgeBase, XNeuroneGrid, initLibxnSchema } from '@damba/libxn';
import { makeFactStore, makeMigrator } from './pg-adapter'; // your adapter (see above)

const sql = postgres(process.env.DATABASE_URL!);   // the connection (one shared pool)
export const factStore = makeFactStore(sql);       // ← THE store, created HERE, once and for all

/** Call at server startup, BEFORE serving requests. */
export async function bootPersistence(): Promise<void> {
  await initLibxnSchema(makeMigrator(sql));         // create/align the tables (idempotent)
}

/** Open a durable memory for a scope, reusing THE factStore. */
export async function openMemory(scope: string): Promise<DurableKnowledgeBase> {
  const kb = new DurableKnowledgeBase(new XNeuroneGrid(undefined, { headless: true }), factStore, scope);
  await kb.hydrate();
  return kb;
}
```

```ts
// main.ts — the entry point
import { bootPersistence, openMemory } from './persistence';

await bootPersistence();                 // once at boot: connection + table creation
const bank = await openMemory('bank');   // reuses factStore, hydrates this scope
// … bank is ready: tell / ledger / vault …
```

> In **tests**, the same `persistence.ts` does `factStore = new InMemoryFactStore()` and
> `bootPersistence` becomes a no-op (no tables to create) — **no other code changes**.

**With a cache** (Redis later) — wrap any store, no caller changes:

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore);   // cache-first reads, write-through writes
```

## The `FactStore` in production (Postgres)

Here is the **complete** adapter — you write it **once** and never touch it again. It's what Damba
uses (verified in production on Neon). For MySQL / SQLite: same interface, a different client.

**The tables** LibXN declares (created by `initLibxnSchema`): `libxn_fact` (the fact:
`scope, id, s, p, o, flags, created_at`, + archive `retracted_at`) and `libxn_fact_source` (its
provenance, 1 fact → N sources). The adapter translates the interface into queries on these two tables.

```ts
// pg-adapter.ts — the migrator + the Postgres FactStore, complete.
import postgres from 'postgres';
import {
  type ColumnSpec, type FactRow, type FactSource, type FactStore, type FactTx,
  type IndexSpec, type SchemaMigrator, type Scope, type TableSpec,
} from '@damba/libxn';

type Sql = ReturnType<typeof postgres>;

// ── Connection (Neon/pgbouncer note: no prepared statements) ──
export const makeSql = (url: string): Sql => postgres(url, { prepare: false });

// ── 1) Migrator: SchemaSpec → idempotent DDL ──
const sqlType = (t: ColumnSpec['type']): string =>
  typeof t === 'object' && 'vector' in t ? `vector(${t.vector})`
    : ({ text: 'TEXT', jsonb: 'JSONB', timestamptz: 'TIMESTAMPTZ', bigint: 'BIGINT',
         int: 'INTEGER', real: 'REAL', boolean: 'BOOLEAN', vector: 'vector' } as const)[t];

const createTable = (t: TableSpec): string =>
  `CREATE TABLE IF NOT EXISTS ${t.name} (\n` +
  [...t.columns.map(c => `  ${c.name} ${sqlType(c.type)}${c.nullable ? '' : ' NOT NULL'}`),
   `  PRIMARY KEY (${t.primaryKey.join(', ')})`].join(',\n') + '\n)';

const createIndex = (t: TableSpec, i: IndexSpec): string =>
  i.method === 'hnsw'
    ? `CREATE INDEX IF NOT EXISTS ${i.name} ON ${t.name} USING hnsw (${i.columns[0]} vector_cosine_ops)`
    : `CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${i.name} ON ${t.name} (${i.columns.join(', ')})`;

export const makeMigrator = (sql: Sql): SchemaMigrator => ({
  async ensureSchema(spec) {
    for (const ext of spec.extensions ?? []) { await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS ${ext}`); }
    for (const t of spec.tables) {
      await sql.unsafe(createTable(t));
      for (const idx of t.indexes ?? []) { await sql.unsafe(createIndex(t, idx)); }
    }
  },
});

// ── 2) FactStore: the interface translated to SQL ──
const toSource = (r: any): FactSource => ({
  kind: r.kind,
  ...(r.ref != null && { ref: r.ref }),
  ...(r.at != null && { at: Number(r.at) }),
  ...(r.confidence != null && { confidence: r.confidence }),
  ...(r.display != null && { display: r.display }),
});

async function hydrate(sql: Sql, facts: any[]): Promise<FactRow[]> {
  const out: FactRow[] = [];
  for (const f of facts) {
    const srcs = await sql`SELECT kind, ref, at, confidence, display FROM libxn_fact_source
                           WHERE fact_id = ${f.id} ORDER BY seq`;
    out.push({ id: f.id, s: f.s, p: f.p, o: f.o, flags: f.flags ?? undefined,
               createdAt: Number(f.created_at), sources: srcs.map(toSource) });
  }
  return out;
}

// Operations bound to ONE SQL executor (normal connection OR transaction).
function ops(sql: Sql): FactTx {
  return {
    async get(scope, s, p) {
      const facts = p
        ? await sql`SELECT id,s,p,o,flags,created_at FROM libxn_fact
                    WHERE scope=${scope} AND s=${s} AND p=${p} AND retracted_at IS NULL`
        : await sql`SELECT id,s,p,o,flags,created_at FROM libxn_fact
                    WHERE scope=${scope} AND s=${s} AND retracted_at IS NULL`;
      return hydrate(sql, facts);
    },
    async put(scope, row) {
      await sql`INSERT INTO libxn_fact (id, scope, s, p, o, flags, created_at)
                VALUES (${row.id}, ${scope}, ${row.s}, ${row.p}, ${row.o},
                        ${row.flags ? sql.json(row.flags as any) : null}, ${row.createdAt})
                ON CONFLICT (scope, id)
                DO UPDATE SET flags = EXCLUDED.flags, retracted_at = NULL, retracted_reason = NULL`;
      await sql`DELETE FROM libxn_fact_source WHERE fact_id = ${row.id}`;
      let seq = 0;
      for (const src of row.sources) {
        await sql`INSERT INTO libxn_fact_source (fact_id, seq, kind, ref, at, confidence, display)
                  VALUES (${row.id}, ${seq++}, ${src.kind}, ${src.ref ?? null},
                          ${src.at ?? null}, ${src.confidence ?? null}, ${src.display ?? null})`;
      }
    },
    async retract(scope, s, p, o, reason) {
      await sql`UPDATE libxn_fact SET retracted_at = ${Date.now()}, retracted_reason = ${reason}
                WHERE scope=${scope} AND s=${s} AND p=${p} AND o=${o} AND retracted_at IS NULL`;
    },
    async setFlags(scope, s, p, o, flags) {
      await sql`UPDATE libxn_fact SET flags = COALESCE(flags, '{}'::jsonb) || ${sql.json(flags as any)}
                WHERE scope=${scope} AND s=${s} AND p=${p} AND o=${o}`;
    },
  };
}

export const makeFactStore = (sql: Sql): FactStore => ({
  ...ops(sql),
  async getAll(scope) {
    const facts = await sql`SELECT id,s,p,o,flags,created_at FROM libxn_fact
                            WHERE scope=${scope} AND retracted_at IS NULL`;
    return hydrate(sql, facts);
  },
  tx: (fn) => sql.begin((tx) => fn(ops(tx as Sql))),   // ← ACID comes from YOUR DB (BEGIN/COMMIT/ROLLBACK)
});
```

And the wiring at startup (the `persistence.ts` module from the previous section):

```ts
import { initLibxnSchema } from '@damba/libxn';
import { makeSql, makeMigrator, makeFactStore } from './pg-adapter';

const sql = makeSql(process.env.DATABASE_URL!);
export const factStore = makeFactStore(sql);                 // created once, reused everywhere
export const bootPersistence = () => initLibxnSchema(makeMigrator(sql)); // creates the tables at boot
```

> To add **vector search** (pgvector) too, the `VectorStore` adapter follows the same shape on the
> `libxn_vector` table (the `<=>` operator for cosine).

## Use cases

> In these examples, `grid` and `factStore` are created as in the **Create a store** section
> (in tests, `new XNeuroneGrid(undefined, { headless: true })` and `new InMemoryFactStore()` are enough).

### 1. An assistant that remembers (durable per-user memory)

The assistant retains facts about the user from one session to the next.

```ts
// On login: reload THIS user's memory.
const kb = new DurableKnowledgeBase(grid, factStore, `user:${userId}`);
await kb.hydrate();

// During the conversation: record what you learn (persisted automatically).
await kb.tell('user', 'first_name', 'Alice');
await kb.tell('user', 'city', 'Port-au-Prince');
await kb.flush();

// Next session (same userId), after hydrate():
kb.ask('user', 'city');   // ['port-au-prince'] — it remembers
```

### 2. A wallet / account (durable + atomic transfer)

```ts
import { TransactionLedger } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, `wallet:${userId}`);
await kb.hydrate();
const ledger = new TransactionLedger(kb, { unit: 'HTG' });

await ledger.open('checking', { initialBalance: 5000, floor: 0 });
await ledger.deposit('checking', 1200, { type: 'salary' });

// Debit + credit in one block: all succeeds, or nothing (DB-level rollback).
await ledger.transfer('checking', 'savings', 800, { ref: 'monthly' });
await kb.flush();

ledger.balance('checking');  // 5400 — recomputed, durable, survives a restart
```

### 3. A durable secrets vault (`FactVault`)

```ts
import { FactVault } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, `vault:${userId}`);
await kb.hydrate();
const vault = new FactVault(kb, { cipher: myAesCipher });

await vault.setSecret('user', 'api_key', 'sk-live-xyz');  // encrypted AT REST + durable
await kb.flush();

// Hidden from normal reads; revealed only with an authenticated session.
vault.read('user', 'api_key', session);   // ['sk-live-xyz']
```

### 4. The same code in tests and production

Only the line that creates the `factStore` changes — all your logic stays identical.

```ts
// In tests (no database, instant):
const factStore = new InMemoryFactStore();

// In production (injected by the backend):
const factStore = pgFactStore;            // Postgres

// ↓ exactly the same code on both sides
const kb = new DurableKnowledgeBase(grid, factStore, scope);
await kb.hydrate();
```

### 5. Multi-tenant isolation (one memory per organization)

The **scope key** guarantees isolation: two scopes never see each other.

```ts
const orgKb = (orgId: string) =>
  new DurableKnowledgeBase(new XNeuroneGrid(undefined, { headless: true }), factStore, `org:${orgId}`);

const acme = orgKb('acme');     await acme.hydrate();
const globex = orgKb('globex'); await globex.hydrate();

await acme.tell('policy', 'leave', '25 days');
globex.ask('policy', 'leave');   // [] — Globex sees nothing of Acme's
```

## Good to know

- **Guaranteeing writes**: writes are mirrored in the background; call `flush()` when you need
  certainty they hit the database (this is what the ledger does after each operation).
- **Snapshot vs ACID**: `KbStore` (snapshot) is enough for general memory; move to `FactStore`
  (row-level, transactional) as soon as there's sensitive value (money, secrets, rights).
- **Everything is scoped** (per user / organization / conversation) — isolation comes from the scope
  key.
- **Painless scaling**: adding Redis = a decorator; moving to CockroachDB = an adapter subclass
  (Postgres-compatible protocol). No business code touched.

> On the Damba side: persistence lives in Postgres (backend) — no more browser storage. Vector search
> goes through **pgvector** via the backend (the client computes the embedding, Postgres searches).
