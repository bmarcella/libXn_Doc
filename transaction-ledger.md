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
    { windowMs: 60_000,     kind: 'depot',   maxAmount: 2000 }, // ≤ 2000 déposés / minute
    { windowMs: 86_400_000, kind: 'retrait', maxCount: 3 },     // ≤ 3 retraits / jour
  ],
});
```

`windowMs` est libre : 60 000 (minute), 3 600 000 (heure), 86 400 000 (jour), ×7 (semaine), etc.
Une limite borne le **montant** (`maxAmount`) et/ou le **nombre** (`maxCount`) de mouvements d'un
sens dans la fenêtre. On en empile autant que le domaine l'exige.

### Dépôts, retraits, virements

```ts
await ledger.deposit('12345_c', 1000);
const r = await ledger.withdraw('12345_c', 200);
//  r.ok / r.reason : 'below-floor' | 'above-ceiling' | 'velocity-exceeded' | 'bad-amount'

// Virement TRANSACTIONNEL : prévalidé des deux côtés ; et si une écriture échoue en cours
// de route, les mouvements déjà commités sont RÉTRACTÉS (compensation) → soldes restaurés.
const v = await ledger.transfer('12345_c', '67890_c', 300, 'loyer');
//  v.ok / v.reason ('rolled-back' si compensation) / v.side ('from' | 'to') / v.fromBalance / v.toBalance

ledger.balance('12345_c');    // calculé par repli, jamais écrit
ledger.movements('12345_c');  // l'historique EST la vérité
```

> **Transactionnalité du virement.** Le lien `(compte, mouvement, id)` est écrit EN DERNIER :
> c'est le point de commit. Un mouvement à moitié écrit n'est jamais compté — chaque écriture est
> donc atomique pour le solde, et un virement qui échoue à mi-chemin **rétracte** (compensation,
> saga) ce qui a été commité, restaurant les soldes (`reason: 'rolled-back'`).
>
> **Limite de garantie.** La consistance forte sous CONCURRENCE (deux virements simultanés sur le
> même compte) ou crash machine entre les deux écritures reste du ressort de l'hôte : pour de la
> valeur réelle, adosser ce modèle à un système de référence transactionnel. QPath modélise le
> grand livre ; il ne remplace pas un cœur bancaire.
