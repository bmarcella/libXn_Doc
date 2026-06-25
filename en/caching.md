# Cache

`@damba/libxn-cache` adds a caching layer to QPath **by decorating ports**. You turn caching on at
wiring time, without touching the core or your business logic. Two ideas drive the whole package:

1. **Additive and opt-in.** Caching wraps an existing port. As long as you decorate nothing, behavior
   is identical. You can remove it in one line.
2. **Fail-open.** Any cache error (Redis down, slow) degrades silently to direct computation. A broken
   cache never breaks a request.

> **What we do not cache.** In-memory synchronous reads (`ask`, `askDirect`) are already `Map`
> lookups: putting them in Redis would be slower (a network round-trip rarely beats a memory access).
> The cache targets the **expensive-to-compute AND shareable**: embeddings, web search, LLM
> extraction, KB-derived results.

## Two adapters

```ts
import { InMemoryCache, RedisCache } from '@damba/libxn-cache';

// Dev, single-process, or an L1 in front of Redis: bounded LRU + TTL, zero dependency.
const cache = new InMemoryCache();

// Multi-process, shared: anti-stampede lock, fail-open. Adapter from @damba/libxn-cache-redis (see below).
const cache = new RedisCache(makeRedisAdapter({ host, port, password }), { prefix: 'prod', lockTtlSeconds: 10 });
```

## The Redis client: the adapter (`@damba/libxn-cache-redis`)

`@damba/libxn-cache` is **universal** (browser + Node) and **depends on no Redis client**, so it does
not pull ioredis into browser bundles. The ready-made Node adapter therefore lives in a separate
satellite package, **`@damba/libxn-cache-redis`**, exactly like `@damba/libxn-postgres` provides
`makeSql` for Postgres.

```ts
import { makeRedisAdapter } from '@damba/libxn-cache-redis';
import { RedisCache } from '@damba/libxn-cache';

// Parity with makeSql(url): one call, and you have a ready Cache.
const cache = new RedisCache(makeRedisAdapter({ host: '127.0.0.1', port: 6379, password }));
```

To manage the client lifecycle (log errors, close it):

```ts
import { createCacheRedis, redisLike } from '@damba/libxn-cache-redis';

const client = createCacheRedis({ host, port, password }); // fail-fast ioredis client
client.on('error', (e) => logger.warn(`Redis cache: ${e.message}`));
const cache = new RedisCache(redisLike(client));
```

> **Why a separate satellite.** The core defines the `RedisLike` PORT; the satellite provides the Node
> ADAPTER (ioredis). Same split as `@damba/libxn` (ports) ↔ `@damba/libxn-postgres` (adapter). Result:
> the browser imports only the core (no ioredis), the server adds `@damba/libxn-cache-redis`.

### Writing your own adapter (optional)

`RedisLike` is just five semantic operations: you can map to node-redis, a mock, etc.

```ts
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean>; // SET NX EX lock
  delIfEquals(key: string, value: string): Promise<void>;                    // safe lock release (atomic Lua)
}
```

## Decorating ports

The decorated ports come from your other `@damba/*` packages (or your own adapters):

```ts
import { cachedEmbedder, cachedSearchPort, cachedLlmChat } from '@damba/libxn-cache';
import { SemanticVectorizer } from '@damba/libxn-embeddings'; // implements TextEmbedder
// searchPort / llmChatPort: YOUR adapters of the SearchPort / LlmChatPort ports from @damba/libxn-agents
// (they call your backend: URL, API key, auth stay on your side).

const vectorizer = new SemanticVectorizer();

// Embeddings: the same text re-encoded (any session, any user) costs only once.
const embedder = cachedEmbedder(vectorizer, cache, { modelId: 'e5-small@1' });

// Web search: the same query hits the external API only once per TTL window.
const search = cachedSearchPort(searchPort, cache, { ttlSeconds: 1800 });

// LLM: cache ONLY deterministic calls (temperature 0: extraction, classification).
// Free chat passes through, never cached.
const llm = cachedLlmChat(llmChatPort, cache);
```

| Variable | Where it comes from |
|----------|---------------------|
| `cache` | `new InMemoryCache()` or `new RedisCache(makeRedisAdapter(...))` (this package) |
| `makeRedisAdapter` | from `@damba/libxn-cache-redis` (ready-made ioredis adapter) |
| `vectorizer` | `SemanticVectorizer` from `@damba/libxn-embeddings` |
| `searchPort` / `llmChatPort` | your adapters of the ports from `@damba/libxn-agents` |
| `sql` | `makeSql(url)` from `@damba/libxn-postgres` |

## Epoch invalidation (Retriever, KB snapshots)

KB-derived caches must invalidate when the KB changes. The solution: an **epoch** (a monotonic
version token per scope) embedded in the key. When the KB changes, the epoch changes, so the key
changes, so every instance reads or recomputes the new key. No invalidation message, no purge, and
above all no stale read is possible: the version is **in** the key.

```ts
import { pgEpochSource, pgKbStore } from '@damba/libxn-postgres';

// Epoch derived from the source of truth (Postgres): advances on every save, shared across instances.
const epoch = pgEpochSource(sql);

// Read-through KbStore (warm restart), coherent across instances.
const kbStore = cachedKbStore(pgKbStore(sql), cache, epoch);

// Retriever: the epoch invalidates automatically after a write; key scoped per account.
const retrieve = cached(cache, {
  type: 'retriever', ttlSeconds: 120,
  keyOf: (q) => q,
  scope: (_q, userId) => `user:${userId}`,
  epoch: { source: epoch, scope: (_q, _userId, projectId) => projectId },
}, (q) => retriever.retrieve(q));
```

## Anti-stampede

`getOrCompute(key, ttl, compute)` guards against the stampede (several requests missing the cache at
the same time for an expensive computation). Internally: a single concurrent computation per key
within the process, **plus** a distributed Redis lock for other instances. The loser waits, re-checks,
otherwise computes: never a deadlock (the lock expires if its holder crashes).

## Key safety

A key encodes its type, its format version, its **scope**, discriminators, and a hash of the variable
payload. Three rules hold the security:

- **Mandatory scope per account** (`user:<id>` or `org:<id>`) for any per-account data. Redis is
  shared: without a scope it would be a cross-account leak. The `global` scope is reserved for values
  that reveal nothing (embeddings, web search: you only get a hit by re-submitting the exact same
  input, which you therefore already know).
- **Never a secret fact** (Vault) in cache.
- **Model id in the key** for embeddings: a model change invalidates everything.

## Recipes & use cases

### 1. Cache any expensive computation (`cached`)

Case: an aggregation, a report, a slow external call that is not a standard port. The `cached()` HOF
wraps any async function, with optional scope and epoch.

```ts
import { cached } from '@damba/libxn-cache';

const monthlyReport = cached(cache, {
  type: 'report', ttlSeconds: 3600,
  keyOf: (orgId, month) => `${orgId}|${month}`,
  scope: (orgId) => `org:${orgId}`,            // scoped per organization
}, (orgId, month) => buildExpensiveReport(orgId, month));

await monthlyReport('acme', '2026-06'); // computed
await monthlyReport('acme', '2026-06'); // served from cache
```

### 2. Scope per account (avoid leaks)

Case: two users issuing the same query must NOT share the result (private data). The `scope` puts the
id in the key, so entries are isolated.

```ts
const search = cached(cache, {
  type: 'search', ttlSeconds: 300,
  keyOf: (q) => q,
  scope: (_q, userId) => `user:${userId}`,     // distinct keys per user
}, (q, userId) => privateSearch(q, userId));

await search('budget', 'alice'); // damba:search:v1:user:alice:…
await search('budget', 'bob');   // damba:search:v1:user:bob:…  (never alice's result)
```

### 3. Choose the TTL by data type

| Data | Suggested TTL | Why |
|------|---------------|-----|
| Embeddings | very long (days) or unlimited | immutable for a given (model, text) |
| Web search | 30 min to 1 h | volatile but not instant |
| LLM extraction | ~1 day | deterministic, the document does not change |
| Retriever | short, or key by **epoch** | depends on the KB state |
| KbStore snapshot | key by **epoch** (no TTL) | invalidated on every write |

### 4. Test without Redis (`InMemoryCache` as a double)

Case: unit tests or local dev without Redis. Same API, in memory, deterministic.

```ts
import { InMemoryCache, cachedSearchPort } from '@damba/libxn-cache';

const cache = new InMemoryCache();
const search = cachedSearchPort(fakeSearchPort, cache); // no Redis required
```

### 5. Invalidate one entry by hand (no epoch)

Case: you know a specific entry is stale (manual edit, webhook). Rebuild the key and delete it; the
next read recomputes.

```ts
import { buildKey, hashKey } from '@damba/libxn-cache';

const key = buildKey({ type: 'search', discriminators: { l: '10' }, hash: hashKey('cats') });
await cache.del(key);
```

### 6. Two-tier cache (L1 memory + L2 Redis), advanced

Case: avoid the Redis round-trip for very hot keys while keeping Redis sharing and persistence.
Compose two `Cache` behind the interface (extend `BaseCache` to get `getOrCompute` + anti-stampede).

```ts
import { BaseCache, InMemoryCache, RedisCache } from '@damba/libxn-cache';

class TieredCache extends BaseCache {
  constructor(private l1: InMemoryCache, private l2: RedisCache) { super(); }
  async get<T>(key: string): Promise<T | undefined> {
    const a = await this.l1.get<T>(key);
    if (a !== undefined) { return a; }
    const b = await this.l2.get<T>(key);
    if (b !== undefined) { await this.l1.set(key, b, 60); } // promote to L1, short TTL
    return b;
  }
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.l1.set(key, value, Math.min(ttl ?? 60, 60));
    await this.l2.set(key, value, ttl);
  }
  async del(key: string): Promise<void> { await this.l1.del(key); await this.l2.del(key); }
}
```

## When to use it

| Good fit | Why |
|----------|-----|
| Embeddings | deterministic, heavy, shared by everyone |
| Web search | external, slow, shareable with TTL |
| LLM extraction / classification | expensive, deterministic (temperature 0) |
| Retriever, KB snapshots | KB-derived, invalidated by epoch |

| Bad fit | Why |
|---------|-----|
| `ask` / `askDirect` | already a memory access, faster than the network |
| Free chat (temperature > 0) | not reproducible, does not repeat |
| Secret facts | confidential, never in a shared cache |
