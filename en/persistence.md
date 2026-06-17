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

**In production — a durable adapter.** Install **`@damba/libxn-postgres`** (Postgres + pgvector) —
the adapters are ready to use. For another database, implement the `FactStore` / `SchemaMigrator`
interfaces. See [The `FactStore` in production](#the-factstore-in-production-postgres).

### Where to initialize it: once, at startup

The `factStore` is created **once**, at your app's boot, in a dedicated module; then all your code
reuses **that same instance** (it's the `factStore` in every example on this page). Never recreate it
per request.

```ts
// persistence.ts — your app's setup, run once at startup
import { DurableKnowledgeBase, XNeuroneGrid, initLibxnSchema } from '@damba/libxn';
import { makeSql, pgFactStore, pgSchemaMigrator } from '@damba/libxn-postgres';

const sql = makeSql(process.env.DATABASE_URL!);    // the connection (one shared pool)
export const factStore = pgFactStore(sql);          // ← THE store, created HERE, once and for all

/** Call at server startup, BEFORE serving requests. */
export async function bootPersistence(): Promise<void> {
  await initLibxnSchema(pgSchemaMigrator(sql));      // create/align the tables (idempotent)
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

> 📦 **The simplest path**: install the ready-made package `@damba/libxn-postgres` (mirror of
> `@damba/libxn-qdrant`). It ships `pgSchemaMigrator` / `pgKbStore` / `pgFactStore` / `pgVectorStore`
> (+ `makeSql`) over a `postgres` client — nothing to write.
>
> ```ts
> import { makeSql, pgSchemaMigrator, pgFactStore } from '@damba/libxn-postgres';
> const sql = makeSql(process.env.DATABASE_URL!);
> await initLibxnSchema(pgSchemaMigrator(sql));
> const factStore = pgFactStore(sql);
> ```

For **another database** (MySQL, SQLite…), simply implement the `FactStore` interface
(`get`/`getAll`/`put`/`retract`/`setFlags`/`tx`) and a `SchemaMigrator`. The **complete, verified
reference code** lives in `@damba/libxn-postgres` — start from there and swap the client.

> To add **vector search** (pgvector) too, the `VectorStore` adapter follows the same shape on the
> `libxn_vector` table (the `<=>` operator for cosine).

## Several stores in the same database (prefix / suffix)

By default the adapter creates tables named `libxn_*`. If you want **several stores to share one
database** — one per product, per customer, per schema version — you can **shift** the table names
with a **prefix** and/or a **suffix** (both optional). Each store then writes into its own set of
tables, with no collision.

```ts
// Two sets of tables in the SAME database: acme_libxn_*  and  beta_libxn_*
// undefined = keep the standard schema; { prefix } = the name shift.
await initLibxnSchema(pgSchemaMigrator(sql), undefined, { prefix: 'acme_' });
await initLibxnSchema(pgSchemaMigrator(sql), undefined, { prefix: 'beta_' });

const acme = pgFactStore(sql, { prefix: 'acme_' });   // → writes to acme_libxn_fact
const beta = pgFactStore(sql, { prefix: 'beta_' });   // → writes to beta_libxn_fact
```

**Why that `undefined`?** `initLibxnSchema` takes **three** arguments —
`initLibxnSchema(migrator, spec?, naming?)`:

| Argument | Role | Here |
|---|---|---|
| `migrator` | the adapter that speaks SQL | `pgSchemaMigrator(sql)` |
| `spec?` | the **table model** to materialize | defaults to LibXN's standard schema (`LIBXN_SCHEMA`) — only pass it for a custom schema |
| `naming?` | the **name shift** `{ prefix?, suffix? }` | what we're setting here |

Since the shift is the **3rd** argument, we leave the 2nd as `undefined` to mean "keep the standard
schema, just apply this prefix." (The `pgFactStore(sql, { prefix })` that follows takes only **two**
arguments: `sql` then the same naming — that's what aligns the store with the tables you created.)

The shift applies to **every factory** (`pgFactStore`, `pgKbStore`, `pgVectorStore`, `pgMediaStore`)
**and to their indexes**. With no prefix or suffix, nothing changes (names stay `libxn_*`) — it's
**backward-compatible**.

> ⚠️ **Same naming on both sides.** The naming passed to `initLibxnSchema` (which *creates* the
> tables) and the one passed to `pgFactStore`/`pgKbStore`/… (which *read/write* them) must be
> **identical** — otherwise the store points at tables that don't exist. In practice, define the
> naming **once** in a constant and reuse it everywhere.

> **Prefix/suffix vs scope**: two complementary layers of isolation. The **scope** (`user:42`,
> `org:acme`) isolates the **data** within one set of tables. The **prefix/suffix** isolates the
> **tables themselves**. To separate tenants *inside* an app, scope is enough
> ([use case 5](#_5-multi-tenant-isolation-one-memory-per-organization)); prefix/suffix is for when
> several apps/instances **physically share** a database.

Need the physical names (diagnostics, manual query)? `resolveLibxnTables(naming)` returns them:

```ts
import { resolveLibxnTables } from '@damba/libxn';
resolveLibxnTables({ prefix: 'acme_' }).fact;   // 'acme_libxn_fact'
```

## Joining two FactStores

When two stores share a database, you can **cross them**: `pgFactJoin` matches their (non-retracted)
facts by **subject** and/or **predicate**, filtered by each side's scope. Useful to enrich an entity
from one store with facts from another, or to find common subjects.

```ts
import { pgFactJoin } from '@damba/libxn-postgres';

// Describe each side: its scope + its naming (the table set it lives in).
const join = pgFactJoin(sql,
  { scope: 'tenantA', naming: { prefix: 'acme_' } },
  { scope: 'tenantB', naming: { prefix: 'beta_' } });

// Subjects present on both sides, with their email on side A:
const rows = await join.match({ keys: ['s'], pA: 'email' });
// → [{ s, pa, oa, pb, ob }, …]
```

The options of `match(...)`:

| Option | Meaning | Default |
|---|---|---|
| `keys` | join columns — `['s']` (same subject), `['s','p']` (same subject **and** predicate) | `['s']` |
| `pA` | keep only side-A facts with this predicate (e.g. `'email'`) | — (no filter) |
| `pB` | same on side B | — |

Each returned row is `{ s, pa, oa, pb, ob }`: the common subject `s`, then the **p**redicate and
**o**bject from each side (`a` = first store, `b` = second). The join is an **INNER JOIN**: only
subjects present **on both sides** come out, and **retracted** facts are excluded automatically. You
can of course cross **two scopes of the same store** (same naming on both sides) — e.g. compare two
users' memories.

> 🔒 **Read-only, same database.** `pgFactJoin` only **reads**; it changes nothing. Both stores must
> live in the **same** database (same `sql`) — it's a SQL join, not a network call between two servers.

## Search at scale (indexes)

Past a few thousand facts, a full table scan gets slow. The fact table is therefore **indexed** on
the three access paths the reasoning actually uses:

| Index | Path | Typical question |
|---|---|---|
| `(scope, s, p)` | **direct**: subject + predicate → object | "what is Alice's city?" (`ask`) |
| `(scope, p, o)` | **inverse**: predicate + object → subjects | "who lives in Port-au-Prince?" (`askInverse`) |
| `(scope, o)` | **by value**: object alone | "where does this value appear?" |

You have **nothing to do**: `initLibxnSchema` is **idempotent** (`CREATE INDEX IF NOT EXISTS`), so
missing indexes are created on the next startup, with no manual migration — including on an existing
database (already-populated tables are simply indexed on the fly). **Vector** search (pgvector, the
`libxn_vector` table) is a separate path: cosine similarity via the `<=>` operator.

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
const factStore = pgFactStore(sql);       // Postgres

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
- **The temporal archive survives a restart**: a durable store can expose the **retracted** facts,
  which are re-injected on hydration. So "back then it was **X**" queries
  ([provenance & re-verification](/en/fact-provenance)) stay available after a restart, not just the
  latest current state.
- **Painless scaling**: adding Redis = a decorator; moving to CockroachDB = an adapter subclass
  (Postgres-compatible protocol). No business code touched.

> On the Damba side: persistence lives in Postgres (backend) — no more browser storage. Vector search
> goes through **pgvector** via the backend (the client computes the embedding, Postgres searches).
