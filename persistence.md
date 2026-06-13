# Persistance

QPath garde sa mémoire de travail **en mémoire** (le graphe est rapide), mais la *durabilité* est
déléguée à des **ports** — exactement comme le LLM, la recherche ou le vectoriel. Le noyau définit
**ce qu'il faut stocker** et **ce que le stockage doit garantir** ; jamais *comment*. Les
adaptateurs (Postgres aujourd'hui, CockroachDB ou un cache Redis demain) implémentent ces ports.

> Conséquence : changer de base ne touche **aucun code métier** — seulement un adaptateur (nouvelle
> techno) ou un décorateur (cache). C'est la même philosophie que tous les autres ports de LibXN.

## Trois granularités, trois ports

```ts
import type { KbStore, FactStore, SchemaMigrator } from '@damba/libxn';
```

### `KbStore` — la mémoire symbolique (snapshot)

Persiste la mémoire complète (le graphe + sa provenance : sources, drapeaux, historique) comme un
**snapshot par scope**. Simple, durable, multi-appareil.

```ts
interface KbStore {
  load(scope: string): Promise<KbSnapshot | null>;
  save(scope: string, snapshot: KbSnapshot): Promise<void>;
  clear(scope: string): Promise<void>;
  append?(scope: string, event: KbEvent): Promise<void>; // incrémental optionnel (journal)
}
```

### `FactStore` — système de référence ROW-LEVEL + ACID

Pour les faits qui **exigent** l'ACID : argent du [grand livre](/transaction-ledger), secrets et
permissions de la [couche d'accès](/access-layer). `tx()` est la **frontière transactionnelle** —
ce qui rend un virement réellement atomique côté base (commit si tout réussit, rollback sinon).

```ts
interface FactStore {
  get(scope: string, s: string, p?: string): Promise<FactRow[]>;
  put(scope: string, row: FactRow): Promise<void>;
  retract(scope: string, s: string, p: string, o: string, reason: string): Promise<void>;
  setFlags(scope: string, s: string, p: string, o: string, flags: FactFlags): Promise<void>;
  tx<T>(fn: (t: FactTx) => Promise<T>): Promise<T>; // ← ACID
}
```

### `VectorStore` — index sémantique

Déjà documenté : la recherche par similarité. **pgvector** en devient un simple adaptateur (il
remplace une base vectorielle dédiée — un système de moins à opérer).

## Auto-initialisation du schéma

LibXN **possède son schéma** : il déclare ses tables (`LIBXN_SCHEMA`, toutes préfixées `libxn_`,
agnostique du SGBD) et les **matérialise à l'initialisation**. L'adaptateur est le seul à parler
SQL — un futur CockroachDB réutilise le même schéma.

```ts
import { initLibxnSchema, LIBXN_SCHEMA } from '@damba/libxn';

// À l'init (bootstrap serveur) : crée/aligne les tables libxn_*, idempotent.
await initLibxnSchema(myMigrator);
```

`LIBXN_SCHEMA` déclare le snapshot (`libxn_kb_snapshot`), les faits row-level
(`libxn_fact` / `libxn_fact_source`, avec archive temporelle), le grand livre append-only
(`libxn_ledger_movement`) et la table vectorielle générique (`libxn_vector` : `collection`, `id`,
colonne `vector` à **dimension libre**, `payload`). La recherche est cosinus exacte ; un index HNSW
(qui exige une dimension fixe) est une optimisation future réservée aux collections à taille fixe.

## Implémentations de référence (en mémoire)

Le noyau fournit des adaptateurs **en mémoire**, zéro dépendance : double de test, mode hors-ligne,
et **spécification exécutable** du comportement attendu — notamment l'ACID de `tx()`.

Trois références, une par port : `InMemoryKbStore`, `InMemoryFactStore`, `InMemoryVectorStore`
(recherche cosinus exacte — le même comportement que l'adaptateur pgvector).

```ts
import { InMemoryKbStore, InMemoryFactStore } from '@damba/libxn';

const facts = new InMemoryFactStore();
await facts.tx(async (t) => {
  await t.put('compte', debitRow);   // jambe 1
  await t.put('compte', creditRow);  // jambe 2
}); // si une jambe lève → rollback : aucune écriture partielle ne subsiste
```

Tout adaptateur durable (Postgres…) doit se comporter **comme** ces références.

## KB durable (`DurableKnowledgeBase`)

Sous-classe **opt-in** du `KnowledgeBase` qui l'adosse à un `FactStore` (le noyau reste
zéro-persistance). C'est ce qui rend durable TOUT ce qui s'appuie sur la KB — faits, et la
[couche d'accès](/access-layer) (secrets, permissions) et le [grand livre](/transaction-ledger).

```ts
import { DurableKnowledgeBase } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, scope);
await kb.hydrate();                       // rejoue les faits durables en mémoire (au démarrage)
await kb.tell('alice', 'role', 'admin');  // write-through → FactStore
await kb.flush();                         // attend les écritures durables

// Atomicité côté base : les écritures de fn entrent dans UNE transaction (commit/rollback).
await kb.transaction(async () => {
  await kb.tell('a', 'solde', '300');
  await kb.tell('b', 'solde', '200');
});
```

- **Hydratation** : `getAll(scope)` → rejeu en mémoire. La KB est le moteur de requête ; le
  FactStore est la vérité durable (pattern *cache + write-through*).
- **Write-through** : chaque mutation est répercutée (file sérielle, `flush()` pour attendre).
- **Transaction** : `TransactionLedger` l'utilise automatiquement (`transfer` atomique côté base
  si le KB est durable) ; sinon, compensation en mémoire inchangée. **Opt-in, zéro régression.**

## En profondeur

### Le modèle à deux niveaux

QPath sépare le **modèle de travail** (le graphe en mémoire, rapide) de la **vérité durable** (le
store). La KB répond aux requêtes et raisonne ; le store garde les faits au-delà du process.

```
        écriture                              lecture (au démarrage)
  app ──tell──▶ KB en mémoire ──write-through──▶ FactStore ──hydrate()──▶ KB en mémoire
                (requêtes, raisonnement)         (Postgres, vérité)        (reconstruit)
```

Deux granularités, deux usages :

| | `KbStore` (snapshot) | `FactStore` (row-level) |
|---|---|---|
| Forme | un blob JSONB par scope (grille + provenance) | une ligne par fait + sa provenance |
| Pour | mémoire symbolique générale, RAG, raisonnement | couche d'accès : argent, secrets, permissions |
| Atouts | simple, une photo cohérente | requêtable en SQL, **transactionnel (ACID)** |

### Le modèle de données

| Table | Contenu |
|---|---|
| `libxn_kb_snapshot` | snapshot par scope : `grid` (jsonb) + `provenance` (jsonb) + `updated_at` |
| `libxn_fact` | un fait : `scope, id, s, p, o, flags, created_at` + archive (`retracted_at/_reason`) |
| `libxn_fact_source` | provenance : 1 fait → N sources (`kind, ref, at, confidence, display`) |
| `libxn_ledger_movement` | mouvements **append-only** (jamais d'`UPDATE`/`DELETE`) |
| `libxn_vector` | vecteurs : `collection, id, v` (dimension libre), `payload` |

L'`id` du fait est le hash déterministe du triplet normalisé (`factId`) ; deux assertions
identiques convergent sur la même ligne (déduplication).

### Chemin d'écriture (write-through)

Chaque mutation alimente une **file sérielle** d'écritures durables (l'ordre est préservé) :

- `tell` (asynchrone) attend la mise en file puis rend la main ; `flush()` attend que la file
  soit vidée. La durabilité est donc **éventuelle** jusqu'au `flush()` — une erreur de base est
  relevée *au flush*, pas à l'écriture.
- Pour une durabilité **stricte** après une opération critique : `await kb.flush()` (c'est ce que
  fait `LedgerService` après chaque dépôt/retrait/virement).

### Chemin de lecture (hydratation)

Au démarrage, `getAll(scope)` rejoue les faits durables dans la KB. Ensuite, **toutes les lectures
sont en mémoire** (le store n'est plus sollicité). Coût : O(faits du scope) au premier accès — d'où
des scopes de taille raisonnable (par utilisateur / organisation / conversation).

### Transactions & garanties

- `transaction(fn)` regroupe les écritures **asynchrones** (`tell`) de `fn` dans une transaction du
  FactStore (commit/rollback). Les mutations **synchrones** (`retract`/`setFlags`) faites pendant
  `fn` ne sont **pas** dans la transaction — elles passent par la file normale.
- En cas de rollback, le FactStore est restauré ; la cohérence **en mémoire** reste au caller
  (compensation, ou re-hydratation). Le `TransactionLedger` couvre ce cas (compensation in-memory).

### Limites à connaître

- **Durabilité éventuelle** par défaut (utiliser `flush()` pour la certitude).
- **Snapshot blob** plafonné (10 Mo côté backend) : pour de gros volumes, préférer le row-level
  `FactStore`, et à terme un **journal incrémental** (`KbStore.append`, write-model à venir).
- **Concurrence** : un seul process écrit en mémoire pour un scope donné ; pas conçu pour des
  écritures concurrentes multi-process sur le même scope sans coordination externe.
- **Policy non persistée** : certaines configs *en mémoire* (ex. limites de vélocité du ledger) ne
  vivent pas dans le store ; solde, plancher/plafond, devise et mouvements, eux, sont durables.

## Plan de montée en charge

| Étape | Techno | Ce qu'on écrit |
|---|---|---|
| **Départ** | PostgreSQL + pgvector | adaptateurs `Pg*` (un seul service : relationnel + vectoriel) |
| **Cache de lecture** | Redis | un **décorateur** autour d'un port — aucun appelant modifié |

Le décorateur de cache existe déjà (`CachingKbStore`) : brancher Redis = remplacer sa `Map` interne
par un client Redis, rien d'autre.

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore); // lecture cache-first, écriture write-through
```

| **Échelle distribuée** | CockroachDB | sous-classe de l'adaptateur Postgres (protocole compatible) |

> La persistance vit côté serveur (Postgres). Côté client, la mémoire transite par le backend — il
> n'y a plus de stockage navigateur (IndexedDB retiré). La **recherche vectorielle** aussi : le
> client calcule l'embedding (MiniLM) puis interroge **pgvector via le backend** — plus d'accès
> direct à une base vectorielle externe.
