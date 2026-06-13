# Persistance

QPath garde sa mémoire **en mémoire** (le graphe est rapide) et délègue la *durabilité* à des
**ports**. Conséquence pratique : tu choisis où stocker sans changer ton code métier — un adaptateur
en test, Postgres en production, demain un cache Redis, le tout par simple injection.

## KB durable (`DurableKnowledgeBase`)

Le cas d'usage principal : rends ta `KnowledgeBase` **durable** en l'adossant à un `FactStore`.
Tout ce qui s'appuie dessus — faits, [grand livre](/transaction-ledger), [couche d'accès](/access-layer)
(secrets, permissions) — devient persistant **sans toucher au reste de ton code**.

```ts
import { DurableKnowledgeBase, InMemoryFactStore, XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true }); // le graphe = mémoire de travail
const factStore = new InMemoryFactStore();                    // OÙ persister (voir « Créer un store »)
const kb = new DurableKnowledgeBase(grid, factStore, `user:${userId}`);

await kb.hydrate();                        // au démarrage : recharge l'état durable
await kb.tell('alice', 'role', 'admin');  // persisté automatiquement (write-through)
await kb.flush();                         // garantit que c'est écrit avant de continuer
```

Les trois arguments : la **grille** (le graphe QPath en mémoire), le **`factStore`** (où les faits
sont réellement persistés — voir juste en dessous), et le **scope** (la clé qui isole cette mémoire,
ex. `user:42`).

Et un **virement atomique** (commit si tout réussit, rollback sinon) :

```ts
await kb.transaction(async () => {
  await kb.tell('a', 'solde', '300');
  await kb.tell('b', 'solde', '200');
});
```

> `TransactionLedger` utilise ça **automatiquement** : construis-le sur une KB durable et `transfer`
> devient atomique côté base, sans rien changer à ton code ledger.

## Sauver / charger une mémoire (`KbStore`)

Pour simplement photographier une mémoire et la recharger (RAG, mémoire générale), sans gestion fine
fait par fait :

```ts
await store.save(scope, kb.grid.serialize());  // sauvegarde
const snapshot = await store.load(scope);      // recharge (ou null)
await store.clear(scope);                      // efface
```

## Quel store pour quel besoin

| Port | À utiliser pour | Atout |
|---|---|---|
| **`KbStore`** | mémoire générale, RAG, raisonnement | simple — une photo cohérente par scope |
| **`FactStore`** | couche d'accès : argent, secrets, permissions | **transactionnel (ACID)** via `tx()` |
| **`VectorStore`** | recherche par similarité (sémantique, chemins) | orthogonal — voir [Composants](/components) |

## Créer un store

Un **store** est l'objet qui persiste réellement les données ; c'est lui qu'on passe à
`DurableKnowledgeBase` (le `factStore`) ou qu'on utilise seul (un `KbStore`). Le noyau définit
seulement les *interfaces* (`FactStore`, `KbStore`) ; l'implémentation dépend d'où tu veux stocker.

> ❓ **Quelle base ? Comment se connecter ?** LibXN **ne le sait pas — et n'a pas à le savoir.** Il ne
> voit que les interfaces. Le **type de base et la connexion sont à TOI** : tu crées le client (avec
> ta chaîne de connexion), tu l'enveloppes dans un adaptateur, et tu le passes à LibXN. C'est ce qui
> garde le noyau zéro-dépendance et portable (Postgres, MySQL, SQLite, en mémoire…).

**En test ou hors-ligne — fourni par le noyau, zéro config :**

```ts
import { InMemoryFactStore } from '@damba/libxn';

const factStore = new InMemoryFactStore();   // tout en RAM, se comporte comme la production
```

**En production — un adaptateur durable.** Tu écris **un seul petit fichier** qui (1) ouvre la
connexion à ta base, (2) crée les tables (`initLibxnSchema`), (3) traduit l'interface `FactStore` en
SQL. C'est le **seul** code spécifique à ta base ; tout le reste ne bouge pas.

👉 Exemple **complet et copiable** ci-dessous : [Le `FactStore` en production (Postgres)](#le-factstore-en-production-postgres).

### Où l'initialiser : une fois, au démarrage

Le `factStore` se crée **une seule fois**, au boot de ton app, dans un module dédié ; ensuite, tout
le code réutilise **cette même instance** (c'est le `factStore` de tous les exemples de cette page).
Ne le recrée jamais par requête.

```ts
// persistence.ts — LE setup de ton app, exécuté une fois au démarrage
import postgres from 'postgres';
import { DurableKnowledgeBase, XNeuroneGrid, initLibxnSchema } from '@damba/libxn';
import { makeFactStore, makeMigrator } from './pg-adapter'; // ton adaptateur (cf. ci-dessus)

const sql = postgres(process.env.DATABASE_URL!);   // la connexion (un seul pool, partagé)
export const factStore = makeFactStore(sql);       // ← LE store, créé ICI, une fois pour toutes

/** À appeler au démarrage du serveur, AVANT de servir des requêtes. */
export async function bootPersistence(): Promise<void> {
  await initLibxnSchema(makeMigrator(sql));         // crée/aligne les tables (idempotent)
}

/** Ouvre une mémoire durable pour un scope, en réutilisant LE factStore. */
export async function openMemory(scope: string): Promise<DurableKnowledgeBase> {
  const kb = new DurableKnowledgeBase(new XNeuroneGrid(undefined, { headless: true }), factStore, scope);
  await kb.hydrate();
  return kb;
}
```

```ts
// main.ts — le point d'entrée
import { bootPersistence, openMemory } from './persistence';

await bootPersistence();                 // 1× au boot : connexion + création des tables
const bank = await openMemory('bank');   // réutilise factStore, hydrate ce scope
// … bank est prête : tell / ledger / vault …
```

> En **test**, le même `persistence.ts` fait `factStore = new InMemoryFactStore()` et `bootPersistence`
> devient un no-op (pas de tables à créer) — **aucun autre code ne change**.

**Avec un cache** (Redis plus tard) — enveloppe n'importe quel store, sans changer les appelants :

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore);   // lecture cache-first, écriture write-through
```

## Le `FactStore` en production (Postgres)

Voici l'adaptateur **complet** — tu l'écris **une seule fois**, tu ne le touches plus. C'est ce que
Damba utilise (vérifié en production sur Neon). Pour MySQL / SQLite : même interface, autre client.

**Les tables** que LibXN déclare (créées par `initLibxnSchema`) : `libxn_fact` (le fait :
`scope, id, s, p, o, flags, created_at`, + archive `retracted_at`) et `libxn_fact_source` (sa
provenance, 1 fait → N sources). L'adaptateur traduit l'interface en requêtes sur ces deux tables.

```ts
// pg-adapter.ts — le migrateur + le FactStore Postgres, complets.
import postgres from 'postgres';
import {
  type ColumnSpec, type FactRow, type FactSource, type FactStore, type FactTx,
  type IndexSpec, type SchemaMigrator, type Scope, type TableSpec,
} from '@damba/libxn';

type Sql = ReturnType<typeof postgres>;

// ── Connexion (note Neon/pgbouncer : pas de prepared statements) ──
export const makeSql = (url: string): Sql => postgres(url, { prepare: false });

// ── 1) Migrateur : SchemaSpec → DDL idempotente ──
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

// ── 2) FactStore : l'interface traduite en SQL ──
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

// Opérations liées à UN exécuteur SQL (connexion normale OU transaction).
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
  tx: (fn) => sql.begin((tx) => fn(ops(tx as Sql))),   // ← l'ACID vient de TA base (BEGIN/COMMIT/ROLLBACK)
});
```

Et le câblage au démarrage (le module `persistence.ts` de la section précédente) :

```ts
import { initLibxnSchema } from '@damba/libxn';
import { makeSql, makeMigrator, makeFactStore } from './pg-adapter';

const sql = makeSql(process.env.DATABASE_URL!);
export const factStore = makeFactStore(sql);                 // créé une fois, réutilisé partout
export const bootPersistence = () => initLibxnSchema(makeMigrator(sql)); // crée les tables au boot
```

> Pour brancher la **recherche vectorielle** (pgvector) en plus, l'adaptateur `VectorStore` suit la
> même forme sur la table `libxn_vector` (opérateur `<=>` pour le cosinus).

## Cas d'usage

> Dans ces exemples, `grid` et `factStore` sont créés comme à la section **Créer un store**
> (en test, `new XNeuroneGrid(undefined, { headless: true })` et `new InMemoryFactStore()` suffisent).

### 1. Un assistant qui se souvient (mémoire durable par utilisateur)

L'assistant retient des faits sur l'utilisateur d'une session à l'autre.

```ts
// À la connexion : on recharge la mémoire de CET utilisateur.
const kb = new DurableKnowledgeBase(grid, factStore, `user:${userId}`);
await kb.hydrate();

// Pendant la conversation : on enregistre ce qu'on apprend (persisté tout seul).
await kb.tell('user', 'prénom', 'Alice');
await kb.tell('user', 'ville', 'Port-au-Prince');
await kb.flush();

// À la prochaine session (même userId), après hydrate() :
kb.ask('user', 'ville');   // ['port-au-prince'] — il s'en souvient
```

### 2. Un portefeuille / compte (durable + virement atomique)

```ts
import { TransactionLedger } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, `wallet:${userId}`);
await kb.hydrate();
const ledger = new TransactionLedger(kb, { unit: 'HTG' });

await ledger.open('courant', { initialBalance: 5000, floor: 0 });
await ledger.deposit('courant', 1200, { type: 'salaire' });

// Débit + crédit en un seul bloc : tout réussit, ou rien (rollback côté base).
await ledger.transfer('courant', 'epargne', 800, { ref: 'mensuel' });
await kb.flush();

ledger.balance('courant');  // 5400 — recalculé, durable, survit au redémarrage
```

### 3. Un coffre à secrets durable (`FactVault`)

```ts
import { FactVault } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, `vault:${userId}`);
await kb.hydrate();
const vault = new FactVault(kb, { cipher: monChiffrementAES });

await vault.setSecret('user', 'cle_api', 'sk-live-xyz');  // chiffré AU REPOS + durable
await kb.flush();

// Masqué des lectures normales ; révélé seulement avec une session authentifiée.
vault.read('user', 'cle_api', session);   // ['sk-live-xyz']
```

### 4. Le même code en test et en production

Seule la ligne qui crée le `factStore` change — toute ta logique reste identique.

```ts
// En test (aucune base, instantané) :
const factStore = new InMemoryFactStore();

// En production (injecté par le backend) :
const factStore = pgFactStore;            // Postgres

// ↓ strictement le même code des deux côtés
const kb = new DurableKnowledgeBase(grid, factStore, scope);
await kb.hydrate();
```

### 5. Isolation multi-locataire (une mémoire par organisation)

La **clé de scope** garantit l'étanchéité : deux scopes ne se voient jamais.

```ts
const orgKb = (orgId: string) =>
  new DurableKnowledgeBase(new XNeuroneGrid(undefined, { headless: true }), factStore, `org:${orgId}`);

const acme = orgKb('acme');     await acme.hydrate();
const globex = orgKb('globex'); await globex.hydrate();

await acme.tell('politique', 'congés', '25 jours');
globex.ask('politique', 'congés');   // [] — Globex ne voit rien d'Acme
```

## Bon à savoir

- **Garantir l'écriture** : les écritures sont répercutées en tâche de fond ; appelle `flush()` quand
  tu as besoin de la certitude qu'elles sont bien en base (c'est ce que fait le ledger après chaque
  opération).
- **Snapshot vs ACID** : `KbStore` (snapshot) suffit pour la mémoire générale ; passe au `FactStore`
  (row-level, transactionnel) dès qu'il y a de la valeur sensible (argent, secrets, droits).
- **Tout est scopé** (par utilisateur / organisation / conversation) — l'isolation est garantie par
  la clé de scope.
- **Montée en charge sans douleur** : ajouter Redis = un décorateur ; passer à CockroachDB = une
  sous-classe d'adaptateur (protocole Postgres-compatible). Aucun code métier touché.

> Côté Damba : la persistance vit dans Postgres (backend) — plus de stockage navigateur. La recherche
> vectorielle passe par **pgvector** via le backend (le client calcule l'embedding, Postgres cherche).
