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

### `FactGuard` — GENERIC access policies

A guard is **not** a login lock: it is a **policy** that reasons over facts (chiefly the
systematic audit facts) to **allow or deny any action**. Account lockout is just one example
among an infinity — quota, schedule, ceiling, geo, role, sequence… All go through the same
interface:

```ts
interface FactGuard {
  name: string;
  actions?: string[];                 // guarded actions (default: all)
  check(ctx: GuardContext): { allow: boolean; reason?: string };
}
```

`vault.authorize(principal, action)` is **the** access-control entry point — for login, a
deposit, a read, or any business verb. It runs the applicable guards; the first one that denies
wins. Actions are recorded as systematic facts via `vault.record(principal, action, outcome)`,
which guards count.

**Example 1 — lock after 5 failed logins** (provided `lockoutGuard` factory):

```ts
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 }));
await vault.login('alice', 'wrong'); // …×5 → each failure is a systematic fact
await vault.login('alice', 'right'); // reason: 'denied' — even the right password is refused
```

**Example 2 — at most 5 deposits per day** (`rateLimitGuard`, on a business action):

```ts
const DAY = 24 * 3600_000;
vault.addGuard(rateLimitGuard({ action: 'deposit', successOutcome: 'done', max: 5, windowMs: DAY }));

// before each deposit:
if (!vault.authorize('alice', 'deposit').allow) throw new Error('daily quota reached');
await ledger.deposit('alice', 100);
await vault.record('alice', 'deposit', 'done'); // so the guard counts it
```

**Example 3 — custom guard (office hours)**: any logic, in a few lines:

```ts
vault.addGuard({
  name: 'office-hours',
  actions: ['read'],
  check: (ctx) => {
    const h = new Date(ctx.now).getHours();
    return h >= 9 && h < 17 ? { allow: true } : { allow: false, reason: 'outside office hours' };
  },
});
```

> A guard can query anything via `ctx.kb` (facts, roles, balances through the ledger…) and
> `ctx.count(action, outcome, windowMs)` (the systematic facts). Protections are therefore
> **unlimited**: write as many as your domain requires.

## `TransactionLedger` — transactional facts

An account / wallet modeled as an **append-only** ledger: each movement is an **immutable**
timestamped fact; the **balance is never stored**, it is computed by folding. The ledger enforces
**per-account constraints** and supports **transfers**.

### Open an account (initial balance, floor, ceiling, velocity)

```ts
const ledger = new TransactionLedger(kb, { currency: 'USD' });

await ledger.open('12345_c', {
  initialBalance: 5000,   // opening endowment
  floor: -4000,           // overdraft allowed down to -4000
  ceiling: 1_000_000,     // maximum positive balance
  limits: [               // velocity: as many limits as you want
    { windowMs: 60_000,     kind: 'depot',   maxAmount: 2000 }, // ≤ 2000 deposited / minute
    { windowMs: 86_400_000, kind: 'retrait', maxCount: 3 },     // ≤ 3 withdrawals / day
  ],
});
```

`windowMs` is free: 60_000 (minute), 3_600_000 (hour), 86_400_000 (day), ×7 (week), etc. A limit
bounds the **amount** (`maxAmount`) and/or the **count** (`maxCount`) of movements of one kind in
the window. Stack as many as the domain requires.

### Deposits, withdrawals, transfers

```ts
await ledger.deposit('12345_c', 1000);
const r = await ledger.withdraw('12345_c', 200);
//  r.ok / r.reason : 'below-floor' | 'above-ceiling' | 'velocity-exceeded' | 'bad-amount'

// ATOMIC transfer: pre-validated on both sides BEFORE any write (nothing if either refuses).
const v = await ledger.transfer('12345_c', '67890_c', 300, 'rent');
//  v.ok / v.reason / v.side ('from' | 'to') / v.fromBalance / v.toBalance

ledger.balance('12345_c');    // folded, never written
ledger.movements('12345_c');  // the history IS the truth
```

> **Guarantee boundary.** The ledger provides the SEMANTICS (immutability, balance, floor/ceiling,
> velocity, transfer pre-validation). **Strong consistency** (ACID, concurrency, true transfer
> atomicity under crash) remains the host's responsibility: for real value, back this model with a
> transactional system of record. QPath models the ledger; it does not replace a banking core.


## `FactAccessControl` — access groups & permissions (RBAC)

For an **organization**: group facts under **access groups**, define **CRUD** permissions
(read / write / update / delete), and **grant or revoke** access per member. Who can see what,
who can change what — at group granularity.

The fully-QPath principle: **permissions are themselves facts**. Granting means writing a fact;
revoking means retracting it (archived — the access history is complete and auditable). Rights
thus inherit everything QPath offers: traceable, **layerable** (a right set at the org level
covers all conversations via the scope stack) and queryable.

```ts
const acl = new FactAccessControl(kb);

// 1) Group facts
await kb.tell('budget', 'amount', '50000');
acl.assign('budget', 'amount', '50000', 'finance');     // → "finance" group

// 2) Grant / revoke (each right is a fact)
await acl.grant('alice', 'finance', 'read', 'write');   // alice: read + write
await acl.grant('admin', 'finance');                    // all permissions
acl.revoke('alice', 'finance', 'write');                // archived, not erased

// 3) Check & introspect
acl.can('alice', 'finance', 'read');                    // true
acl.permissionsOf('alice', 'finance');                  // ['read']
acl.membersWithAccess('finance', 'write');              // ['admin']  — who can write?
acl.groupsAccessibleBy('alice', 'read');                // ['finance']

// 4) Governed operations (checked CRUD)
const { result, facts } = acl.read('bob', 'finance');   // result.allowed=false (bob not allowed)
await acl.write('admin', 'finance', 'bonus', 'is', '1000');        // ok → fact tagged "finance"
await acl.update('admin', 'finance', 'bonus', 'is', '1000', '1200');
acl.remove('admin', 'finance', 'bonus', 'is', '1200');            // retracted (archived)
```

Each `read/write/update/delete` checks the permission before acting and returns
`{ allowed, missing? }`. Since rights are facts, a full audit ("who granted write access to
finance, and when?") reads directly from provenance and history.


## Full example — personal vault + wallet

**The problem.** An app where every user has (a) a password, (b) a secret to protect (API key,
private note), (c) a wallet. We want: registration, brute-force-resistant login, a secret that
stays invisible until you log in, and a balance that never corrupts. All modeled in QPath facts
— crypto plugged in via ports.

```ts
import {
  KnowledgeBase, XNeuroneGrid, FactVault, TransactionLedger, lockoutGuard,
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
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 }));

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
vault.auditTrail('bigvai@mail.com', 'login');        // [{ action:'login', outcome:'failure', at }, { …'success' }]
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
