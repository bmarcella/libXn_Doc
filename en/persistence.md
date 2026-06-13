# Persistence

QPath keeps its memory **in memory** (the graph is fast) and delegates *durability* to **ports**.
Practical upshot: you choose where to store without changing your business code — an adapter in
tests, Postgres in production, a Redis cache tomorrow, all by injection.

## Durable KB (`DurableKnowledgeBase`)

The main use case: make your `KnowledgeBase` **durable** by backing it with a `FactStore`. Everything
built on it — facts, [ledger](/en/transaction-ledger), [access layer](/en/access-layer) (secrets,
permissions) — becomes persistent **without touching the rest of your code**.

```ts
import { DurableKnowledgeBase } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, `user:${userId}`);
await kb.hydrate();                        // at startup: reload durable state
await kb.tell('alice', 'role', 'admin');  // persisted automatically (write-through)
await kb.flush();                         // ensure it's written before moving on
```

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

## Setting it up

**In tests or offline** — in-memory adapters, zero config:

```ts
import { InMemoryKbStore, InMemoryFactStore } from '@damba/libxn';
const facts = new InMemoryFactStore();   // behaves like production
```

**In production** — Postgres (+ pgvector) adapters on the backend. Tables **create themselves** at
startup: LibXN owns its schema and materializes it.

```ts
import { initLibxnSchema } from '@damba/libxn';
await initLibxnSchema(myMigrator); // idempotent — at server init
```

**With a cache** (Redis later) — wrap any store, no caller changes:

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore); // cache-first reads, write-through writes
```

## Use cases

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
const ledger = new TransactionLedger(kb, { currency: 'HTG' });

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
