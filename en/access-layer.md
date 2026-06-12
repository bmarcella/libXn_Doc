# Access layer — identity, secrets, transactions

A QPath feature for developers: model **identity, confidentiality, access control and
transactions** directly in facts. Everything follows the **ports** architecture — QPath provides
the semantics and interfaces; the developer **injects the crypto and the guarantees**. The core
hard-codes no password and never stores a secret in clear.

## `FactVault` — secret facts, authentication, guards, audit

### Secret facts (confidentiality)

A secret fact has its value **encrypted at rest** (via an injected `CipherPort`) and is **hidden
from normal reads** (`allFacts`, RAG, admin view). Only authenticated access through the Vault
reveals it.

```ts
const vault = new FactVault(kb, { authenticator, cipher });
await vault.setSecret('bigvai#1', 'password', 'hunter2');

kb.allFacts();                        // the fact does not appear
vault.read('bigvai#1', 'password');   // [] without a session
vault.read('bigvai#1', 'password', session); // ['hunter2'] with a valid session
```

### Authentication (port)

`FactAuthenticator` is the contract you implement with **your** crypto (Argon2id, JWT…):

```ts
interface FactAuthenticator {
  authenticate(principal, credential): Promise<Session | null>;
  verify(session): boolean;
}
```

### System facts (audit)

Every `vault.login()` **emits a timestamped fact** `(audit:<principal>, attempt, success|failure|lock)`.
The access layer narrates its own activity **as facts** — self-referential, 100% QPath.

### `FactGuard` — access policies

A guard **reads the system facts** to enforce an access rule. Lock after N failures in a window:

```ts
vault.addGuard({ principal: 'alice', lockAfterFailures: 5, windowMs: 15 * 60_000 });
await vault.login('alice', 'wrong'); // …×5
vault.isLocked('alice'); // true — even the right password is refused until it expires
```

## `TransactionLedger` — transactional facts

An account / wallet modeled as an **append-only** ledger: each movement is an **immutable**
timestamped fact; the **balance is never stored**, it is computed by folding the movements; a
withdrawal that would make the balance negative is **refused** (configurable invariant).

```ts
const ledger = new TransactionLedger(kb, { currency: 'HTG' });
await ledger.open('12345_c');
await ledger.deposit('12345_c', 1000);
await ledger.withdraw('12345_c', 1000);
ledger.balance('12345_c');    // computed, never written
ledger.movements('12345_c');  // the history IS the truth
```

> **Guarantee boundary.** The ledger provides the SEMANTICS (immutability, balance computation,
> non-negative invariant). **Strong consistency** (ACID, concurrency) remains the host's
> responsibility: for real value, back this model with a transactional system of record. QPath
> models the ledger; it does not replace a banking core.

## The security principle

- Crypto lives in **injected ports** (`CipherPort`, `FactAuthenticator`) — never in the core.
  `PlaintextCipher` (default) is explicitly marked **insecure**: inject real encryption in
  production.
- QPath **models and orchestrates**; the real strength (hash strength, encryption secrecy,
  persistence, transactions) comes from what the developer plugs in.
