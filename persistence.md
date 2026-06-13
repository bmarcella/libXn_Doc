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

**En test ou hors-ligne — fourni par le noyau, zéro config :**

```ts
import { InMemoryFactStore, InMemoryKbStore } from '@damba/libxn';

const factStore = new InMemoryFactStore();   // tout en RAM, se comporte comme la production
```

**En production — un adaptateur durable.** Le noyau **n'embarque aucune dépendance base de données** :
l'adaptateur Postgres vit dans ton backend (il porte la connexion). Côté Damba c'est `PgFactStore`,
fourni par l'injection de dépendances — tu le reçois et l'utilises tel quel :

```ts
// dans un service backend (NestJS) : l'adaptateur durable est injecté
constructor(private readonly factStore: PgFactStore) {}
```

Pour brancher **ta** propre base, implémente l'interface `FactStore`
(`get` / `getAll` / `put` / `retract` / `setFlags` / `tx`) — le reste du code ne change pas.

**Les tables se créent seules.** LibXN possède son schéma et le matérialise à l'initialisation
(idempotent) :

```ts
import { initLibxnSchema } from '@damba/libxn';
await initLibxnSchema(myMigrator);   // au démarrage du serveur
```

**Avec un cache** (Redis plus tard) — enveloppe n'importe quel store, sans changer les appelants :

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore);   // lecture cache-first, écriture write-through
```

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
const ledger = new TransactionLedger(kb, { currency: 'HTG' });

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
