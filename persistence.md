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
(`libxn_ledger_movement`) et l'index vectoriel (`libxn_embedding`, colonne `vector` + index HNSW).

## Implémentations de référence (en mémoire)

Le noyau fournit des adaptateurs **en mémoire**, zéro dépendance : double de test, mode hors-ligne,
et **spécification exécutable** du comportement attendu — notamment l'ACID de `tx()`.

Trois références, une par port : `InMemoryKbStore`, `InMemoryFactStore`, `InMemoryVectorStore`
(recherche cosinus exacte — le comportement que pgvector reproduit à l'échelle via HNSW).

```ts
import { InMemoryKbStore, InMemoryFactStore } from '@damba/libxn';

const facts = new InMemoryFactStore();
await facts.tx(async (t) => {
  await t.put('compte', debitRow);   // jambe 1
  await t.put('compte', creditRow);  // jambe 2
}); // si une jambe lève → rollback : aucune écriture partielle ne subsiste
```

Tout adaptateur durable (Postgres…) doit se comporter **comme** ces références.

## Plan de montée en charge

| Étape | Techno | Ce qu'on écrit |
|---|---|---|
| **Départ** | PostgreSQL + pgvector | adaptateurs `Pg*` (un seul service : relationnel + vectoriel) |
| **Cache de lecture** | Redis | un **décorateur** autour d'un port — aucun appelant modifié |
| **Échelle distribuée** | CockroachDB | sous-classe de l'adaptateur Postgres (protocole compatible) |

> La persistance vit côté serveur (Postgres). Côté client, la mémoire transite par le backend — il
> n'y a plus de stockage navigateur (IndexedDB retiré). La **recherche vectorielle** aussi : le
> client calcule l'embedding (MiniLM) puis interroge **pgvector via le backend** — plus d'accès
> direct à une base vectorielle externe.
