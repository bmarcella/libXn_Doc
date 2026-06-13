# Grand livre transactionnel

## `TransactionLedger` — faits transactionnels

Un compte / portefeuille modélisé en grand livre **append-only** : chaque mouvement est un fait
**immuable** horodaté ; le **solde n'est jamais stocké**, il est calculé par repli. Le ledger
applique des **contraintes par compte** et sait faire des **virements**.

### Ouvrir un compte (solde initial, plancher, plafond, vélocité)

```ts
const ledger = new TransactionLedger(kb, { currency: 'USD' });

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

`windowMs` est libre : 60 000 (minute), 3 600 000 (heure), 86 400 000 (jour), ×7 (semaine), etc.
Une limite borne le **montant** (`maxAmount`) et/ou le **nombre** (`maxCount`) de mouvements d'un
sens dans la fenêtre. On en empile autant que le domaine l'exige.

### Types de transaction PRÉ-CONFIGURÉS

Les types sont déclarés à la construction. **Dès qu'au moins un type est configuré, il devient
REQUIS** : un dépôt/retrait sans type valide est refusé (`reason: 'invalid-type'`). Un type peut
être restreint à un sens (`kind`).

```ts
const ledger = new TransactionLedger(kb, {
  currency: 'USD',
  types: [
    { name: 'salaire', kind: 'deposit', label: 'Salaire' },  // dépôt seulement
    { name: 'loyer',   kind: 'withdraw' },                   // retrait seulement
    { name: 'virement_interne' },                          // sans restriction de sens
  ],
});
await ledger.ready;            // les types sont déclarés en async
ledger.declaredTypes();        // [{ name:'loyer', kind:'retrait' }, …]
```

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

### Cycle de vie du compte

Un compte est **actif**, **bloqué** (gel temporaire) ou **fermé** (terminal). Une opération sur
un compte non actif est refusée (`account-blocked` / `account-closed`).

```ts
await ledger.block('12345_c', 'fraude suspectée');   // gel → dépôts/retraits/virements refusés
ledger.statusOf('12345_c');                          // 'blocked'
await ledger.unblock('12345_c');                     // retour à 'active'

await ledger.close('12345_c');                       // TERMINAL : plus aucune opération, pas de déblocage
```

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
  currency: 'HTG',
  minBalance: 1000, maxBalance: 50_000,
  sort: 'balance', desc: true,   // 'id' | 'balance' | 'movements'
  offset: 0, limit: 20,
});
page.items;   // [{ id, balance, currency, status, movementCount, floor, ceiling }, …]
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

ledger.movementById('mv:cli_bob:withdraw:200:1700000000000'); // lookup direct, ou undefined
```

> Tout est **calculé**, jamais dénormalisé : le solde et le décompte d'une page sont repliés à la
> volée depuis les mouvements immuables — aucun compteur à maintenir, donc rien à désynchroniser.

> **Transactionnalité du virement.** Le lien `(compte, mouvement, id)` est écrit EN DERNIER :
> c'est le point de commit. Un mouvement à moitié écrit n'est jamais compté — chaque écriture est
> donc atomique pour le solde, et un virement qui échoue à mi-chemin **rétracte** (compensation,
> saga) ce qui a été commité, restaurant les soldes (`reason: 'rolled-back'`).
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
