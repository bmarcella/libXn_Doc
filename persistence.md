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

// undefined = encodeur par défaut ; headless = sans rendu (Node/serveur). Le graphe = mémoire de travail.
const grid = new XNeuroneGrid(undefined, { headless: true });
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

**En production — un adaptateur durable.** Installe **`@damba/libxn-postgres`** (Postgres + pgvector) :
les adaptateurs sont prêts à l'emploi. Pour une autre base, implémente les interfaces `FactStore` /
`SchemaMigrator`. Voir [Le `FactStore` en production](#le-factstore-en-production-postgres).

### Où l'initialiser : une fois, au démarrage

Le `factStore` se crée **une seule fois**, au boot de ton app, dans un module dédié ; ensuite, tout
le code réutilise **cette même instance** (c'est le `factStore` de tous les exemples de cette page).
Ne le recrée jamais par requête.

```ts
// persistence.ts — LE setup de ton app, exécuté une fois au démarrage
import { DurableKnowledgeBase, XNeuroneGrid, initLibxnSchema } from '@damba/libxn';
import { makeSql, pgFactStore, pgSchemaMigrator } from '@damba/libxn-postgres';

const sql = makeSql(process.env.DATABASE_URL!);    // la connexion (un seul pool, partagé)
export const factStore = pgFactStore(sql);          // ← LE store, créé ICI, une fois pour toutes

/** À appeler au démarrage du serveur, AVANT de servir des requêtes. */
export async function bootPersistence(): Promise<void> {
  await initLibxnSchema(pgSchemaMigrator(sql));      // crée/aligne les tables (idempotent)
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

> 📦 **Le plus simple** : installe le paquet prêt à l'emploi `@damba/libxn-postgres` (miroir de
> `@damba/libxn-qdrant`). Il fournit `pgSchemaMigrator` / `pgKbStore` / `pgFactStore` /
> `pgVectorStore` (+ `makeSql`) sur un client `postgres` — rien à écrire.
>
> ```ts
> import { makeSql, pgSchemaMigrator, pgFactStore } from '@damba/libxn-postgres';
> const sql = makeSql(process.env.DATABASE_URL!);
> await initLibxnSchema(pgSchemaMigrator(sql));
> const factStore = pgFactStore(sql);
> ```

Pour une **autre base** (MySQL, SQLite…), implémente simplement l'interface `FactStore`
(`get`/`getAll`/`put`/`retract`/`setFlags`/`tx`) et un `SchemaMigrator`. Le **code de référence
complet et vérifié** est dans `@damba/libxn-postgres` — pars de là et change le client.

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
