# Couche d'accès — identité, secrets, transactions

Une feature de QPath pour les développeurs : modéliser **identité, confidentialité, contrôle
d'accès et transactions** directement dans les faits. Tout suit l'architecture par **ports** —
QPath fournit la sémantique et les interfaces ; le développeur **injecte la crypto et les
garanties**. Le noyau ne code en dur aucun mot de passe, ne stocke jamais de secret en clair.

## `FactVault` — faits secrets, authentification, gardes, audit

### Faits secrets (confidentialité)

Un fait secret a sa valeur **chiffrée au repos** (via un `CipherPort` injecté) et est **masqué
des lectures normales** (`allFacts`, RAG, vue admin). Seul un accès authentifié via le Vault le
révèle.

```ts
const vault = new FactVault(kb, { authenticator, cipher });
await vault.setSecret('bigvai#1', 'password', 'hunter2');

kb.allFacts();                        // le fait n'y apparaît pas
vault.read('bigvai#1', 'password');   // [] sans session
vault.read('bigvai#1', 'password', session); // ['hunter2'] avec session valide
```

### Authentification (port)

`FactAuthenticator` est le contrat que tu implémentes avec **ta** crypto (Argon2id, JWT…) :

```ts
interface FactAuthenticator {
  authenticate(principal, credential): Promise<Session | null>;
  verify(session): boolean;
}
```

### Faits systématiques (audit)

Chaque `vault.login()` **émet un fait horodaté** `(audit:<principal>, tentative, succès|échec|verrou)`.
La couche d'accès raconte sa propre activité **en faits** — auto-référentiel, 100 % QPath.

### `FactGuard` — politiques d'accès

Une garde **lit les faits systématiques** pour appliquer une règle d'accès. Verrou après N
échecs dans une fenêtre :

```ts
vault.addGuard({ principal: 'alice', lockAfterFailures: 5, windowMs: 15 * 60_000 });
await vault.login('alice', 'mauvais'); // …×5
vault.isLocked('alice'); // true — même le bon mot de passe est refusé jusqu'à expiration
```

## `TransactionLedger` — faits transactionnels

Un compte / portefeuille modélisé en grand livre **append-only** : chaque mouvement est un fait
**immuable** horodaté ; le **solde n'est jamais stocké**, il est calculé par repli des
mouvements ; un retrait qui rendrait le solde négatif est **refusé** (invariant configurable).

```ts
const ledger = new TransactionLedger(kb, { currency: 'HTG' });
await ledger.open('12345_c');
await ledger.deposit('12345_c', 1000);
await ledger.withdraw('12345_c', 1000);
ledger.balance('12345_c');    // calculé, jamais écrit
ledger.movements('12345_c');  // l'historique EST la vérité
```

> **Limite de garantie.** Le ledger fournit la SÉMANTIQUE (immuabilité, calcul du solde,
> invariant non négatif). La **consistance forte** (ACID, concurrence) reste du ressort de
> l'hôte : pour de la valeur réelle, adosser ce modèle à un système de référence transactionnel.
> QPath modélise le grand livre ; il ne remplace pas un cœur bancaire.

## Le principe de sécurité

- La crypto vit dans des **ports injectés** (`CipherPort`, `FactAuthenticator`) — jamais dans le
  noyau. `PlaintextCipher` (défaut) est explicitement marqué **non sécurisé** : injecter un vrai
  chiffrement en production.
- QPath **modélise et orchestre** ; la solidité réelle (force du hachage, secret du chiffrement,
  persistance, transactions) vient de ce que le développeur branche.
