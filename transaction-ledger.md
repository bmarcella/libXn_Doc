# Grand livre transactionnel

## `TransactionLedger` — faits transactionnels

Un compte / portefeuille modélisé en grand livre **append-only** : chaque mouvement est un fait
**immuable** horodaté ; le **solde n'est jamais stocké**, il est calculé par repli. Le ledger
applique des **contraintes par compte** et sait faire des **virements**.

> **Vitrine exécutable.** `npm run example:ledger` déroule une banque complète où **toute** la
> logique — comptes, plancher/plafond, limites de vélocité, **règle anti-fraude ajoutée à chaud
> (sans redéploiement)**, secret au coffre, audit — vit dans des **faits gouvernés** : déterministe,
> traçable, atomique, sans état caché. C'est la thèse de Damba en un scénario : *le comportement de
> l'application EST des faits que l'on interroge, gouverne et fait évoluer.*

### Ouvrir un compte (solde initial, plancher, plafond, vélocité)

```ts
const ledger = new TransactionLedger(kb, { unit: 'USD' });

await ledger.open('12345_c', {
  initialBalance: 5000,   // dotation d'ouverture
  floor: -4000,           // découvert autorisé jusqu'à -4000
  ceiling: 1_000_000,     // solde positif maximum
  limits: [               // vélocité : autant de limites que voulu
    { windowMs: 60_000,     kind: 'deposit',  maxAmount: 2000 }, // ≤ 2000 déposés / minute
    { windowMs: 86_400_000, kind: 'withdraw', maxCount: 3 },     // ≤ 3 retraits / jour
  ],
});
```

**`new TransactionLedger(kb, options?)`** — le constructeur prend deux arguments :

- `kb` — la `KnowledgeBase` (ou `DurableKnowledgeBase`) qui stocke les faits. **Obligatoire.** C'est
  d'elle que vient la durabilité : un ledger sur une [`DurableKnowledgeBase`](/persistence#kb-durable-durableknowledgebase)
  devient persistant et transactionnel **sans changer le code ledger**.
- `options?` — les `LedgerOptions` (toutes optionnelles ; `{}` par défaut). Voir le tableau ci-dessous.

| Option (`LedgerOptions`) | Rôle | Défaut |
|---|---|---|
| `name` | Nom du grand livre (son rôle), ex. « Comptes courants », « Crédits API » | — |
| `description` | Description libre de ce que ce livre suit | — |
| `unit` | Unité **par défaut** des quantités (`'USD'`, `'pts'`, `'kWh'`…). Un livre n'est pas forcément de l'argent | — (sans unité) |
| `allowNegative` | Le solde peut-il devenir négatif **sans plancher explicite** ? | `false` (plancher implicite à `0`) |
| `floor` | Plancher par défaut (solde minimum), surchargeable par compte | `0` (ou `-∞` si `allowNegative`) |
| `ceiling` | Plafond par défaut (solde maximum), surchargeable par compte | `+∞` |
| `limits` | Limites de vélocité **globales** (s'ajoutent à celles de chaque compte) | `[]` |
| `types` | Types de transaction pré-configurés. Dès qu'un type est déclaré, il devient **REQUIS** | `[]` (aucun → type libre) |
| `now` | Fournisseur d'horloge (`() => number`, epoch ms) — utile en test pour figer le temps | `() => Date.now()` |

**`ledger.open(account, config?)`** — ouvre/configure un compte. Renvoie `Promise<void>` ; **idempotent**.

| Argument | Rôle | Défaut |
|---|---|---|
| `account` | Identifiant du compte (chaîne ; normalisé par le KB) | **obligatoire** |
| `config.unit` | Unité de **ce** compte | hérite du `unit` du ledger |
| `config.initialBalance` | Dotation d'ouverture (écrite comme mouvement « ouverture », **hors contraintes**). Seulement si > 0 et compte vierge | `0` (aucun mouvement) |
| `config.floor` | Plancher (solde minimum, ex. `-4000` pour un découvert). **Remplace** l'ancienne valeur à la ré-ouverture | `floor` du ledger |
| `config.ceiling` | Plafond (solde maximum). **Remplace** l'ancienne valeur à la ré-ouverture | `ceiling` du ledger |
| `config.limits` | Limites de vélocité **propres** au compte (s'ajoutent aux globales) | `[]` |

Chaque entrée de `limits` est une `VelocityLimit` :

| Champ (`VelocityLimit`) | Rôle | Défaut |
|---|---|---|
| `windowMs` | Taille de la fenêtre glissante en ms | **obligatoire** |
| `kind` | Sens limité (`'deposit'` / `'withdraw'`) | absent = **les deux** |
| `maxAmount` | Somme maximale des montants dans la fenêtre | — (pas de borne montant) |
| `maxCount` | Nombre maximal de mouvements dans la fenêtre | — (pas de borne nombre) |
| `label` | Libellé lisible de la limite | — |

`windowMs` est libre : 60 000 (minute), 3 600 000 (heure), 86 400 000 (jour), ×7 (semaine), etc.
Une limite borne le **montant** (`maxAmount`) et/ou le **nombre** (`maxCount`) de mouvements d'un
sens dans la fenêtre. On en empile autant que le domaine l'exige.

> 💡 La dotation d'ouverture (`initialBalance`) est écrite **hors contraintes** et ignorée par les
> compteurs de vélocité (son `ref` interne est `ouverture`) : elle ne consomme pas un quota.

> `open()` est **idempotent** et **reconfigurable** : ré-ouvrir un compte avec un autre plancher
> ou plafond **remplace** l'ancienne valeur (la nouvelle gagne), sans empiler de doublon.

### Types de transaction PRÉ-CONFIGURÉS

Les types sont déclarés à la construction. **Dès qu'au moins un type est configuré, il devient
REQUIS** : un dépôt/retrait sans type valide est refusé (`reason: 'invalid-type'`). Un type peut
être restreint à un sens (`kind`).

```ts
const ledger = new TransactionLedger(kb, {
  unit: 'USD',
  types: [
    { name: 'salaire', kind: 'deposit', label: 'Salaire' },  // dépôt seulement
    { name: 'loyer',   kind: 'withdraw' },                   // retrait seulement
    { name: 'virement_interne' },                          // sans restriction de sens
  ],
});
await ledger.ready;            // les types sont déclarés en async
ledger.declaredTypes();        // [{ name:'loyer', kind:'withdraw' }, …]
```

Chaque entrée de `types` est une `TransactionType` :

| Champ (`TransactionType`) | Rôle | Défaut |
|---|---|---|
| `name` | Identifiant du type (normalisé en minuscules) | **obligatoire** |
| `kind` | Restreint le type à un sens (`'deposit'` / `'withdraw'`) | absent = **les deux** (donc utilisable en virement) |
| `label` | Libellé d'affichage, **casse préservée** (« Salaire ») | — |

- **`ledger.ready`** — une `Promise<void>` (et non une méthode). Le constructeur ne pouvant pas
  `await`, les types globaux sont déclarés en arrière-plan ; `await ledger.ready` garantit qu'ils le
  sont avant la première opération.
- **`ledger.declaredTypes()`** — sans argument ; renvoie un `TransactionType[]` trié par `name`,
  reconstruit depuis les faits (le `label` ressort avec sa casse d'origine).

> 💡 Un type **sans `kind`** est le seul utilisable pour un **virement** (qui enjambe les deux sens) :
> `transfer` refuse (`reason: 'invalid-type'`) un type restreint à `'deposit'` ou `'withdraw'`.

### Dépôts, retraits, virements (avec métadonnées)

Chaque mouvement porte un **type**, son **auteur** (`by` = created_by) et sa **date** (`at` =
created_at, automatique).

```ts
await ledger.deposit('12345_c', 2500, { type: 'salaire', by: 'alice', ref: 'mars' });
const r = await ledger.withdraw('12345_c', 200, { type: 'loyer', by: 'alice' });
//  r.reason : 'invalid-type' | 'below-floor' | 'above-ceiling' | 'velocity-exceeded' | 'bad-amount'

// Virement TRANSACTIONNEL : prévalidé des deux côtés ; si une écriture échoue, les mouvements
// déjà commités sont RÉTRACTÉS (compensation) → soldes restaurés. Le type doit être NON restreint.
const v = await ledger.transfer('12345_c', '67890_c', 300, { type: 'virement_interne', by: 'alice' });
//  v.reason : 'rolled-back' (compensation) | 'invalid-type' | … / v.side ('from' | 'to')

ledger.balance('12345_c');    // calculé par repli, jamais écrit
ledger.movements('12345_c');  // historique : { kind, amount, type, by, at, ref } — la vérité
```

**`ledger.deposit(account, amount, meta?)`** et **`ledger.withdraw(account, amount, meta?)`** ont la
même forme et renvoient une `Promise<PostResult>` :

| Argument | Rôle | Défaut |
|---|---|---|
| `account` | Compte cible | **obligatoire** |
| `amount` | Montant **positif** (un montant ≤ 0 ou non fini → `reason: 'bad-amount'`) | **obligatoire** |
| `meta.type` | Type de transaction (**requis** dès qu'au moins un type est configuré) | — |
| `meta.by` | Auteur (`created_by`) | — |
| `meta.ref` | Référence libre (filtrable / recherchable ensuite) | `ledger:<deposit\|withdraw>` |

**`ledger.transfer(from, to, amount, meta?)`** → `Promise<TransferResult>` :

| Argument | Rôle | Défaut |
|---|---|---|
| `from` | Compte débité | **obligatoire** |
| `to` | Compte crédité | **obligatoire** |
| `amount` | Montant positif | **obligatoire** |
| `meta.type` | Type **non restreint** (sans `kind`) si des types sont configurés | — |
| `meta.by` | Auteur des deux jambes | — |
| `meta.ref` | Référence des deux jambes | `virement:<from>-><to>` |

**Formes de retour.** `PostResult` = `{ ok, reason, movement?, balance }` : `ok` (booléen), `reason`
(la cause si refus, sinon `null`), `movement` (le mouvement écrit si succès), `balance` (le solde
**après** l'opération). `TransferResult` = `{ ok, reason, side?, fromBalance, toBalance }` : `side`
(`'from'` | `'to'`) indique **quel côté** a causé le refus ; `fromBalance`/`toBalance` sont les soldes
résultants des deux comptes.

- **`ledger.balance(account)`** → `number` — solde courant (dépôts − retraits), arrondi au centième,
  **jamais stocké** (calculé par repli des mouvements).
- **`ledger.movements(account)`** → `Movement[]` — l'historique trié du plus ancien au plus récent.
  Chaque `Movement` = `{ id, account, kind, amount, at, type?, by?, ref? }`.

> ⚠️ Les **montants** doivent être strictement positifs ; le sens (dépôt vs retrait) vient de la
> méthode appelée, pas du signe. Un montant négatif est refusé (`bad-amount`), il ne « retire » pas.

### Cycle de vie du compte

Un compte est **actif**, **bloqué** (gel temporaire) ou **fermé** (terminal). Une opération sur
un compte non actif est refusée (`account-blocked` / `account-closed`).

```ts
await ledger.block('12345_c', 'fraude suspectée');   // gel → dépôts/retraits/virements refusés
ledger.statusOf('12345_c');                          // 'blocked'
await ledger.unblock('12345_c');                     // retour à 'active'

await ledger.close('12345_c');                       // TERMINAL : plus aucune opération, pas de déblocage
```

- **`ledger.block(account, reason?)`** → `Promise<void>` — gèle le compte. `reason` (optionnel) est la
  cause archivée dans l'historique ; défaut `'ledger:block'`. **Sans effet sur un compte fermé.**
- **`ledger.unblock(account)`** → `Promise<void>` — un seul argument ; remet le compte à `'active'`.
  Sans effet si le compte n'est pas `'blocked'`.
- **`ledger.close(account, reason?)`** → `Promise<void>` — ferme définitivement (état **terminal** :
  aucun déblocage possible). `reason` par défaut `'ledger:close'`.
- **`ledger.statusOf(account)`** → `AccountStatus` (`'active'` | `'blocked'` | `'closed'`) ; un compte
  jamais modifié renvoie `'active'`.

> Les changements d'état sont eux-mêmes des faits (rétractés/archivés à chaque transition) :
> l'historique du compte — quand il a été bloqué, par qui, pourquoi — est auditable.

### Énumérer : comptes & mouvements (pagination, filtres, recherche)

Tout compte ouvert (ou simplement touché par un mouvement) devient **énumérable**. Les listes
renvoient une `Page<T>` : `{ items, total, offset, limit, hasMore }` — `total` est le décompte
**avant** découpe, pour calculer le nombre de pages.

```ts
// Comptes : recherche par id, filtres (statut / devise / solde), tri, pagination
const page = ledger.accounts({
  search: 'cli_',           // sous-chaîne dans l'id
  status: 'active',         // 'active' | 'blocked' | 'closed'
  unit: 'HTG',
  minBalance: 1000, maxBalance: 50_000,
  sort: 'balance', desc: true,   // 'id' | 'balance' | 'movements'
  offset: 0, limit: 20,
});
page.items;   // [{ id, balance, unit, status, movementCount, floor, ceiling }, …]
page.total;   // nb de comptes correspondant au filtre
page.hasMore; // reste-t-il une page suivante ?

ledger.account('cli_bob');     // synthèse d'UN compte, ou undefined
ledger.hasAccount('cli_bob');  // existe ?

// Mouvements : dépôts / retraits filtrés et paginés
ledger.deposits('cli_bob', { offset: 0, limit: 50 });       // raccourci kind='deposit'
ledger.withdrawals('cli_bob', { since: t0, until: t1 });    // raccourci kind='withdraw'
ledger.movementsPage('cli_bob', {
  kind: 'withdraw', type: 'loyer', by: 'alice',
  ref: 'mars', search: 'virement',   // recherche plein-texte sur id/ref/type/auteur
  since: t0, until: t1,              // bornes temporelles (epoch ms)
  desc: true, offset: 0, limit: 100, // plus récent d'abord
});

ledger.movementById('mv:cli_bob:withdraw:200:1700000000000:0'); // lookup direct, ou undefined
```

**`ledger.accounts(query?)`** → `Page<AccountSummary>`. Toutes les options sont optionnelles (`{}`
liste tout) :

| Option (`AccountQuery`) | Rôle | Défaut |
|---|---|---|
| `search` | Sous-chaîne recherchée dans l'**id** du compte | — (aucun filtre) |
| `status` | `'active'` \| `'blocked'` \| `'closed'` | — |
| `unit` | Ne garder que les comptes de cette unité | — |
| `minBalance` / `maxBalance` | Bornes de solde (incluses) | — |
| `sort` | Clé de tri : `'id'` \| `'balance'` \| `'movements'` | `'id'` |
| `desc` | Ordre décroissant | `false` |
| `offset` | Décalage de pagination | `0` |
| `limit` | Taille de page | absent = **tout** (pas de troncature) |

`Page<T>` = `{ items, total, offset, limit, hasMore }` : `total` est le décompte **avant** découpe
(pour calculer le nombre de pages), `hasMore` indique s'il reste une page. `AccountSummary` =
`{ id, balance, unit?, status, movementCount, floor, ceiling }`.

**`ledger.movementsPage(account, query?)`** → `Page<Movement>`. `account` obligatoire, options :

| Option (`MovementQuery`) | Rôle | Défaut |
|---|---|---|
| `kind` | `'deposit'` \| `'withdraw'` | — (les deux) |
| `type` | Filtre par type de transaction | — |
| `by` | Filtre par auteur | — |
| `ref` | Sous-chaîne dans la **référence** | — |
| `since` / `until` | Bornes temporelles en epoch ms (incluses) | — |
| `search` | Recherche plein-texte sur `id` / `ref` / `type` / auteur | — |
| `desc` | Plus récent d'abord | `false` (plus ancien d'abord) |
| `offset` / `limit` | Pagination | `0` / tout |

- **`ledger.deposits(account, query?)`** / **`ledger.withdrawals(account, query?)`** — raccourcis de
  `movementsPage` avec `kind` forcé à `'deposit'` / `'withdraw'` (le `kind` que tu passes est écrasé).
- **`ledger.account(account)`** → `AccountSummary | undefined` — synthèse d'**un** compte (`undefined`
  s'il n'existe pas). Un seul argument.
- **`ledger.hasAccount(account)`** → `boolean` — le compte a-t-il été enregistré (ouvert ou touché) ?
- **`ledger.movementById(id)`** → `Movement | undefined` — recherche directe par id de mouvement,
  tous comptes confondus.

> Tout est **calculé**, jamais dénormalisé : le solde et le décompte d'une page sont repliés à la
> volée depuis les mouvements immuables — aucun compteur à maintenir, donc rien à désynchroniser.

> **Transactionnalité du virement.** Le lien `(compte, mouvement, id)` est écrit EN DERNIER :
> c'est le point de commit. Un mouvement à moitié écrit n'est jamais compté — chaque écriture est
> donc atomique pour le solde, et un virement qui échoue à mi-chemin **rétracte** (compensation,
> saga) ce qui a été commité, restaurant les soldes (`reason: 'rolled-back'`).
>
> **Chaque mouvement est unique.** Deux mouvements identiques (même compte, même sens, même montant)
> à la **même milliseconde** ne se confondent plus : chacun porte un identifiant propre et compte
> séparément dans le solde — finie la perte silencieuse du second.
>
> **Limite de garantie.** La consistance forte sous CONCURRENCE (deux virements simultanés sur le
> même compte) ou crash machine entre les deux écritures reste du ressort de l'hôte : pour de la
> valeur réelle, adosser ce modèle à un système de référence transactionnel. QPath modélise le
> grand livre ; il ne remplace pas un cœur bancaire.

### Durabilité & ACID (KB durable)

Construis le ledger sur une [`DurableKnowledgeBase`](/persistence#kb-durable-durableknowledgebase)
(adossée à un `FactStore` Postgres) et il devient **persistant et transactionnel** sans changer une
ligne de ton code ledger :

- les mouvements sont **write-through** vers la base (ils survivent au redémarrage — au rechargement,
  `hydrate()` rejoue l'historique et les soldes sont identiques) ;
- `transfer` exécute ses deux jambes dans **une transaction de la base** (commit/rollback) → la
  « limite de garantie » ci-dessus est levée : c'est de l'atomicité réelle côté store.

```ts
const kb = new DurableKnowledgeBase(grid, factStore, `ledger:${userId}`);
await kb.hydrate();
const ledger = new TransactionLedger(kb);   // identique — la durabilité vient du KB
await ledger.transfer('a', 'b', 200);        // atomique côté base si le KB est durable
```

**`new DurableKnowledgeBase(grid, factStore, scope)`** — trois arguments (détaillés dans
[Persistance](/persistence#kb-durable-durableknowledgebase)) : `grid` (le graphe QPath en mémoire),
`factStore` (où les faits sont réellement persistés) et `scope` (la clé qui isole cette mémoire, ex.
`ledger:42`). `await kb.hydrate()` recharge l'état durable au démarrage.

> 💡 Ici `new TransactionLedger(kb)` est appelé **sans options** : il hérite des unités/contraintes
> par défaut. La durabilité et l'atomicité de `transfer` viennent **uniquement** du `kb` durable —
> le code du ledger est strictement le même qu'en mémoire.
