# Cache

`@damba/libxn-cache` ajoute une couche de cache à QPath **par décoration de ports**. Tu actives le
cache au câblage, sans toucher au cœur ni à la logique métier. Deux idées guident tout le paquet :

1. **Additif et opt-in.** Le cache enveloppe un port existant. Tant que tu ne décores rien, le
   comportement est identique. Tu peux le retirer en une ligne.
2. **Fail-open.** Toute erreur du cache (Redis indisponible, lent) dégrade silencieusement vers le
   calcul direct. Un cache en panne ne casse jamais une requête.

> **Ce qu'on ne cache pas.** Les lectures synchrones en mémoire (`ask`, `askDirect`) sont déjà des
> accès `Map` : les mettre dans Redis serait plus lent (un aller-retour réseau bat rarement un accès
> mémoire). Le cache vise le **coûteux à calculer ET partageable** : embeddings, recherche web,
> extraction LLM, résultats dérivés du KB.

## Deux adaptateurs

```ts
import { InMemoryCache, RedisCache } from '@damba/libxn-cache';

// Dev, mono-process, ou L1 devant Redis : LRU borné + TTL, zéro dépendance.
const cache = new InMemoryCache();

// Multi-process, partagé : verrou anti-stampede, fail-open. Adaptateur via @damba/libxn-cache-redis (voir plus bas).
const cache = new RedisCache(makeRedisAdapter({ host, port, password }), { prefix: 'prod', lockTtlSeconds: 10 });
```

## Le client Redis : l'adaptateur (paquet `@damba/libxn-cache-redis`)

`@damba/libxn-cache` est **universel** (navigateur + Node) et **ne dépend d'aucun client Redis**, pour
ne pas tirer ioredis dans les bundles navigateur. L'adaptateur Node prêt à l'emploi vit donc dans un
paquet satellite séparé, **`@damba/libxn-cache-redis`**, exactement comme `@damba/libxn-postgres`
fournit `makeSql` pour Postgres.

```ts
import { makeRedisAdapter } from '@damba/libxn-cache-redis';
import { RedisCache } from '@damba/libxn-cache';

// Parité avec makeSql(url) : un appel, et tu as un Cache prêt.
const cache = new RedisCache(makeRedisAdapter({ host: '127.0.0.1', port: 6379, password }));
```

Pour gérer le cycle de vie du client (journaliser les erreurs, fermer) :

```ts
import { createCacheRedis, redisLike } from '@damba/libxn-cache-redis';

const client = createCacheRedis({ host, port, password }); // client ioredis fail-fast
client.on('error', (e) => logger.warn(`Redis cache: ${e.message}`));
const cache = new RedisCache(redisLike(client));
```

> **Pourquoi un satellite séparé.** Le cœur définit le PORT `RedisLike` ; le satellite fournit
> l'ADAPTATEUR Node (ioredis). Même découpage que `@damba/libxn` (ports) ↔ `@damba/libxn-postgres`
> (adaptateur). Résultat : le navigateur n'importe que le cœur (zéro ioredis), le serveur ajoute
> `@damba/libxn-cache-redis`.

### Écrire ton propre adaptateur (optionnel)

`RedisLike` n'est que cinq opérations sémantiques : tu peux mapper vers node-redis, un mock, etc.

```ts
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean>; // verrou SET NX EX
  delIfEquals(key: string, value: string): Promise<void>;                    // libération de verrou sûre (Lua atomique)
}
```

## Décorer les ports

Les ports décorés viennent de tes autres paquets `@damba/*` (ou de tes propres adaptateurs) :

```ts
import { cachedEmbedder, cachedSearchPort, cachedLlmChat } from '@damba/libxn-cache';
import { SemanticVectorizer } from '@damba/libxn-embeddings'; // implémente TextEmbedder
// searchPort / llmChatPort : TES adaptateurs des ports SearchPort / LlmChatPort de @damba/libxn-agents
// (ils appellent ton backend : URL, clé API, auth restent chez toi).

const vectorizer = new SemanticVectorizer();

// Embeddings : le même texte ré-encodé (toute session, tout utilisateur) ne coûte qu'une fois.
const embedder = cachedEmbedder(vectorizer, cache, { modelId: 'e5-small@1' });

// Recherche web : la même requête n'appelle l'API externe qu'une fois par fenêtre TTL.
const search = cachedSearchPort(searchPort, cache, { ttlSeconds: 1800 });

// LLM : on ne cache QUE les appels déterministes (temperature 0 : extraction, classification).
// Le chat libre passe au travers, jamais caché.
const llm = cachedLlmChat(llmChatPort, cache);
```

| Variable | D'où elle vient |
|----------|-----------------|
| `cache` | `new InMemoryCache()` ou `new RedisCache(makeRedisAdapter(...))` (ce paquet) |
| `makeRedisAdapter` | de `@damba/libxn-cache-redis` (adaptateur ioredis prêt à l'emploi) |
| `vectorizer` | `SemanticVectorizer` de `@damba/libxn-embeddings` |
| `searchPort` / `llmChatPort` | tes adaptateurs des ports de `@damba/libxn-agents` |
| `sql` | `makeSql(url)` de `@damba/libxn-postgres` |

## Invalidation par époque (Retriever, snapshots du KB)

Les caches dérivés du KB doivent s'invalider quand le KB change. La solution : une **époque** (un
jeton de version monotone par scope) intégrée à la clé. Quand le KB change, l'époque change, donc la
clé change, donc toute instance lit ou recalcule la nouvelle clé. Pas de message d'invalidation, pas
de purge, et surtout aucune lecture périmée possible : la version est **dans** la clé.

```ts
import { pgEpochSource, pgKbStore } from '@damba/libxn-postgres';

// Époque dérivée de la source de vérité (Postgres) : avance à chaque sauvegarde, partagée entre instances.
const epoch = pgEpochSource(sql);

// KbStore en lecture cache (redémarrage à chaud), cohérent en multi-instance.
const kbStore = cachedKbStore(pgKbStore(sql), cache, epoch);

// Retriever : l'époque invalide automatiquement après une écriture ; clé scopée par compte.
const retrieve = cached(cache, {
  type: 'retriever', ttlSeconds: 120,
  keyOf: (q) => q,
  scope: (_q, userId) => `user:${userId}`,
  epoch: { source: epoch, scope: (_q, _userId, projectId) => projectId },
}, (q) => retriever.retrieve(q));
```

## Anti-stampede

`getOrCompute(key, ttl, compute)` protège contre la ruée (plusieurs requêtes qui ratent le cache en
même temps pour un calcul coûteux). En interne : un seul calcul concurrent par clé dans le process,
**plus** un verrou distribué côté Redis pour les autres instances. Le perdant patiente, re-teste,
sinon calcule : jamais de blocage (le verrou expire si son détenteur tombe).

## Sécurité des clés

Une clé encode son type, sa version de format, son **scope**, des discriminants et un hash du
payload variable. Trois règles tiennent la sécurité :

- **Scope obligatoire par compte** (`user:<id>` ou `org:<id>`) pour toute donnée par compte. Redis
  est partagé : sans scope, ce serait une fuite entre comptes. Le scope `global` est réservé aux
  valeurs qui ne révèlent rien (embeddings, recherche web : on n'obtient un hit qu'en re-soumettant
  exactement la même entrée, donc qu'on connaît déjà).
- **Jamais de fait secret** (Coffre) en cache.
- **Identifiant de modèle dans la clé** des embeddings : un changement de modèle invalide tout.

## Recettes & cas d'usage

### 1. Cacher n'importe quel calcul coûteux (`cached`)

Cas : une agrégation, un rapport, un appel externe lent qui n'est pas un port standard. Le HOF
`cached()` enveloppe n'importe quelle fonction async, avec scope et époque optionnels.

```ts
import { cached } from '@damba/libxn-cache';

const monthlyReport = cached(cache, {
  type: 'report', ttlSeconds: 3600,
  keyOf: (orgId, month) => `${orgId}|${month}`,
  scope: (orgId) => `org:${orgId}`,            // scopé par organisation
}, (orgId, month) => buildExpensiveReport(orgId, month));

await monthlyReport('acme', '2026-06'); // calculé
await monthlyReport('acme', '2026-06'); // servi du cache
```

### 2. Scoper par compte (éviter les fuites)

Cas : deux utilisateurs qui posent la même requête ne doivent PAS partager le résultat (données
privées). Le `scope` met l'id dans la clé, donc les entrées sont cloisonnées.

```ts
const search = cached(cache, {
  type: 'search', ttlSeconds: 300,
  keyOf: (q) => q,
  scope: (_q, userId) => `user:${userId}`,     // clés distinctes par utilisateur
}, (q, userId) => privateSearch(q, userId));

await search('budget', 'alice'); // damba:search:v1:user:alice:…
await search('budget', 'bob');   // damba:search:v1:user:bob:…  (jamais le résultat d'alice)
```

### 3. Choisir le TTL selon la donnée

| Donnée | TTL conseillé | Pourquoi |
|--------|---------------|----------|
| Embeddings | très long (jours) voire illimité | immuable pour un (modèle, texte) donné |
| Recherche web | 30 min à 1 h | volatil mais pas instantané |
| Extraction LLM | ~1 jour | déterministe, le document ne change pas |
| Retriever | court, ou clé par **époque** | dépend de l'état du KB |
| Snapshot KbStore | clé par **époque** (pas de TTL) | invalidé à chaque écriture |

### 4. Tester sans Redis (`InMemoryCache` comme double)

Cas : tests unitaires ou dev local sans Redis. Même API, en mémoire, déterministe.

```ts
import { InMemoryCache, cachedSearchPort } from '@damba/libxn-cache';

const cache = new InMemoryCache();
const search = cachedSearchPort(fakeSearchPort, cache); // aucun Redis requis
```

### 5. Invalider une entrée à la main (sans époque)

Cas : tu sais qu'une entrée précise est périmée (édition manuelle, webhook). Reconstruis la clé et
supprime-la ; la prochaine lecture recalcule.

```ts
import { buildKey, hashKey } from '@damba/libxn-cache';

const key = buildKey({ type: 'search', discriminators: { l: '10' }, hash: hashKey('chats') });
await cache.del(key);
```

### 6. Cache à deux étages (L1 mémoire + L2 Redis), avancé

Cas : éviter l'aller-retour Redis pour les clés très chaudes, tout en gardant le partage et la
persistance de Redis. On compose deux `Cache` derrière l'interface (hérite de `BaseCache` pour
récupérer `getOrCompute` + l'anti-stampede).

```ts
import { BaseCache, InMemoryCache, RedisCache } from '@damba/libxn-cache';

class TieredCache extends BaseCache {
  constructor(private l1: InMemoryCache, private l2: RedisCache) { super(); }
  async get<T>(key: string): Promise<T | undefined> {
    const a = await this.l1.get<T>(key);
    if (a !== undefined) { return a; }
    const b = await this.l2.get<T>(key);
    if (b !== undefined) { await this.l1.set(key, b, 60); } // promeut en L1, TTL court
    return b;
  }
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.l1.set(key, value, Math.min(ttl ?? 60, 60));
    await this.l2.set(key, value, ttl);
  }
  async del(key: string): Promise<void> { await this.l1.del(key); await this.l2.del(key); }
}
```

## Quand l'utiliser

| Bon candidat | Pourquoi |
|--------------|----------|
| Embeddings | déterministe, lourd, partagé entre tous |
| Recherche web | externe, lent, partageable avec TTL |
| Extraction / classification LLM | cher, déterministe (temperature 0) |
| Retriever, snapshots du KB | dérivés du KB, invalidés par époque |

| Mauvais candidat | Pourquoi |
|------------------|----------|
| `ask` / `askDirect` | déjà un accès mémoire, plus rapide que le réseau |
| Chat libre (temperature > 0) | non reproductible, ne se répète pas |
| Faits secrets | confidentiels, jamais en cache partagé |
