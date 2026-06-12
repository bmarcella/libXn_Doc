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

## Full example — personal vault + wallet

**The problem.** An app where every user has (a) a password, (b) a secret to protect (API key,
private note), (c) a wallet. We want: registration, brute-force-resistant login, a secret that
stays invisible until you log in, and a balance that never corrupts. All modeled in QPath facts
— crypto plugged in via ports.

```ts
import {
  KnowledgeBase, XNeuroneGrid, FactVault, TransactionLedger,
  type FactAuthenticator, type CipherPort, type Session,
} from '@damba/libxn';
import {
  scryptSync, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv,
} from 'node:crypto';

// 1) REAL encryption of secret values (AES-256-GCM). In the browser: Web Crypto.
class AesCipher implements CipherPort {
  constructor(private key: Buffer) {}                 // 32 bytes, kept OUT of the graph
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
  }
  decrypt(cipher: string): string {
    const [iv, tag, enc] = cipher.split(':').map(h => Buffer.from(h, 'hex'));
    const d = createDecipheriv('aes-256-gcm', this.key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  }
}

// 2) REAL authenticator: verifies a scrypt hash stored as a fact (never the password).
class PasswordAuthenticator implements FactAuthenticator {
  constructor(private kb: KnowledgeBase) {}
  async authenticate(principal: string, password: string): Promise<Session | null> {
    const [record] = this.kb.ask(principal, 'pwd');   // "salt:hash"
    if (!record) return null;
    const [salt, hash] = record.split(':');
    const candidate = scryptSync(password, salt, 32).toString('hex');
    const ok = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
    return ok ? { principal, issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 } : null;
  }
  verify(s: Session): boolean { return !s.expiresAt || s.expiresAt > Date.now(); }
}

// ── Setup
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const vault = new FactVault(kb, {
  authenticator: new PasswordAuthenticator(kb),
  cipher: new AesCipher(randomBytes(32)),             // key out of the graph
});
const ledger = new TransactionLedger(kb, { currency: 'USD' });

// ── Registration: store the HASH, never the password; the secret is encrypted
async function register(principal: string, password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  await kb.tell(principal, 'pwd', `${salt}:${hash}`);
}
await register('bigvai@mail.com', 'hunter2');
await vault.setSecret('bigvai@mail.com', 'api_key', 'sk-live-xyz');
vault.addGuard({ principal: 'bigvai@mail.com', lockAfterFailures: 5, windowMs: 15 * 60_000 });

// ── Login (brute-force resistant: 5 failures → lock; each attempt = an audit fact)
await vault.login('bigvai@mail.com', 'wrong');                // failure, traced
const { session } = await vault.login('bigvai@mail.com', 'hunter2'); // success

// ── After login: the secret is revealed, the wallet is usable
vault.read('bigvai@mail.com', 'api_key');           // []            — without a session
vault.read('bigvai@mail.com', 'api_key', session!); // ['sk-live-xyz'] — decrypted
await ledger.open('bigvai@mail.com');
await ledger.deposit('bigvai@mail.com', 250);
await ledger.withdraw('bigvai@mail.com', 100);
ledger.balance('bigvai@mail.com');                   // 150 — folded, never stored
vault.auditTrail('bigvai@mail.com');                 // [{ outcome:'failure', at }, { outcome:'success', at }]
```

**What it solves, concretely**: the password exists nowhere (only its hash), the secret is
encrypted and invisible to normal reads and admins, brute-force is blocked at the 5th attempt
and every try leaves an auditable trace, and the balance recomputes from history — impossible to
desync. Everything lives in facts; the strength comes from the injected ports (AES, scrypt), not
the core.


## The security principle

- Crypto lives in **injected ports** (`CipherPort`, `FactAuthenticator`) — never in the core.
  `PlaintextCipher` (default) is explicitly marked **insecure**: inject real encryption in
  production.
- QPath **models and orchestrates**; the real strength (hash strength, encryption secrecy,
  persistence, transactions) comes from what the developer plugs in.
