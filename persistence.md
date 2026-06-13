# Persistance

QPath garde sa mémoire **en mémoire** (le graphe est rapide) et délègue la *durabilité* à des
**ports**. Conséquence pratique : tu choisis où stocker sans changer ton code métier — un adaptateur
en test, Postgres en production, demain un cache Redis, le tout par simple injection.

## KB durable (`DurableKnowledgeBase`)

Le cas d'usage principal : rends ta `KnowledgeBase` **durable** en l'adossant à un `FactStore`.
Tout ce qui s'appuie dessus — faits, [grand livre](/transaction-ledger), [couche d'accès](/access-layer)
(secrets, permissions) — devient persistant **sans toucher au reste de ton code**.

```ts
import { DurableKnowledgeBase } from '@damba/libxn';

const kb = new DurableKnowledgeBase(grid, factStore, `user:${userId}`);
await kb.hydrate();                        // au démarrage : recharge l'état durable
await kb.tell('alice', 'role', 'admin');  // persisté automatiquement (write-through)
await kb.flush();                         // garantit que c'est écrit avant de continuer
```

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

## Mise en place

**En test ou hors-ligne** — adaptateurs en mémoire, zéro config :

```ts
import { InMemoryKbStore, InMemoryFactStore } from '@damba/libxn';
const facts = new InMemoryFactStore();   // se comporte comme la production
```

**En production** — adaptateurs Postgres (+ pgvector) côté backend. Les tables se **créent seules**
au démarrage : LibXN possède son schéma et le matérialise.

```ts
import { initLibxnSchema } from '@damba/libxn';
await initLibxnSchema(myMigrator); // idempotent — à l'init du serveur
```

**Avec un cache** (Redis plus tard) — enveloppe n'importe quel store, sans changer les appelants :

```ts
import { CachingKbStore } from '@damba/libxn';
const store = new CachingKbStore(pgKbStore); // lecture cache-first, écriture write-through
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
