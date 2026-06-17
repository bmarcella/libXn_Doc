# Access layer — identity, secrets, access control

A QPath feature for developers: model **identity, confidentiality, access control and
transactions** directly in facts. Everything follows the **ports** architecture — QPath provides
the semantics and interfaces; the developer **injects the crypto and the guarantees**. The core
hard-codes no password and never stores a secret in clear.

> The **[Transaction ledger](transaction-ledger)** (`TransactionLedger`) has its own page.

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

**`new FactVault(kb, opts)`** — two arguments:

- `kb`: the `KnowledgeBase` (or `DurableKnowledgeBase`) where the facts live. The vault stores nothing on the side: a secret is a normal fact carrying the `secret` flag.
- `opts`: an options object, **all fields optional**:

| Field | Role | Default |
|---|---|---|
| `authenticator` | the `FactAuthenticator` port that **verifies** sessions (your crypto: Argon2id, JWT…). Without it, the vault is **fail-closed** (no reveal) | `undefined` |
| `cipher` | the `CipherPort` that encrypts/decrypts values at rest | `PlaintextCipher` — **insecure**, replace in prod |
| `now` | injectable clock (`() => number`), useful for deterministic tests (guard windows) | `() => Date.now()` |
| `insecureAllowUnauthenticated` | DEV/TEST only: reveals secrets on any session, **without** an authenticator | `false` |

**`vault.setSecret(s, p, plainO, source?)`** → `Promise<void>`. Writes the triplet `(s, p, plainO)` with the value **encrypted at rest** and the `secret` flag. The 4th argument `source` (provenance) is optional; default `{ kind: 'user', ref: 'vault' }`.

**`vault.read(s, p, session?)`** → **`string[]`** (never `null`). Returns the fact's values:
- `session` missing or invalid → `secret` values are **omitted** (empty array if the fact has only secrets).
- `session` valid (verified by the `authenticator`) → secrets are **decrypted** and included.

> 💡 The `string[]` shape mirrors `kb.ask`: a subject+predicate may have several values. For a single secret, read `vault.read(...)[0]`.

> **Fail-closed by default.** With no injected `authenticator`, the Vault **refuses** every
> reveal — a `Session` is just an unsigned object, accepting it unverified would be *fail-open*.
> For a dev sandbox, the explicit `insecureAllowUnauthenticated: true` lifts the guard (never
> enable it in production).

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

**`vault.authorize(principal, action)`** → **`{ allow: boolean; reason?: string }`** (synchronous):
- `principal`: the subject involved (user, account…).
- `action`: the verb attempted (`'login'`, `'deposit'`, `'read'`…). Only guards whose `actions` include this value (or that have **no** `actions`, i.e. "all") are consulted.
- Return: `{ allow: true }` if no guard denies; otherwise `{ allow: false, reason }` from the **first** guard that denies.

**`vault.record(principal, action, outcome, at?)`** → `Promise<void>`. Emits a timestamped systematic fact `(audit:<principal>, action, outcome)`.

| Argument | Role | Default |
|---|---|---|
| `principal` | audit subject | — (required) |
| `action` | recorded verb (must match what guards count) | — (required) |
| `outcome` | free-form result (`'done'`, `'failure'`, `'success'`…) — this is what `lockoutGuard`/`rateLimitGuard` count | — (required) |
| `at` | fact timestamp (ms) | `now()` (the vault's clock) |

> ⚠️ The `outcome` you pass to `record(...)` must be **exactly** what the guard expects: `lockoutGuard` counts `'failure'` by default, `rateLimitGuard` counts `'done'`. A different label = the guard sees nothing.

**Example 1 — lock after 5 failed logins** (provided `lockoutGuard` factory):

```ts
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 }));
await vault.login('alice', 'wrong'); // …×5 → each failure is a systematic fact
await vault.login('alice', 'right'); // reason: 'denied' — even the right password is refused
```

**`lockoutGuard(opts)`** → a `FactGuard` ready to pass to `addGuard`. Fields of `opts`:

| Field | Role | Default |
|---|---|---|
| `action` | the guarded (and counted) action, e.g. `'login'` | — (required) |
| `maxFailures` | number of failures within the window that triggers the lock | — (required) |
| `windowMs` | width of the sliding window, in milliseconds | — (required) |
| `failureOutcome` | the `outcome` label counted as a failure | `'échec'` |
| `name` | guard name (trace/audit) | `'lockout:<action>'` |

**`vault.login(principal, credential)`** → **`Promise<LoginResult>`**, where `LoginResult = { session: Session | null; reason: 'bad-credential' | 'denied' | null; guardReason?: string }`. `reason` is `null` on success, `'denied'` if a guard blocked (with `guardReason`), `'bad-credential'` if authentication failed. Requires an injected `authenticator` (throws otherwise).

**Example 2 — at most 5 deposits per day** (`rateLimitGuard`, on a business action):

```ts
const DAY = 24 * 3600_000;
vault.addGuard(rateLimitGuard({ action: 'deposit', successOutcome: 'done', max: 5, windowMs: DAY }));

// before each deposit:
if (!vault.authorize('alice', 'deposit').allow) throw new Error('daily quota reached');
await ledger.deposit('alice', 100);
await vault.record('alice', 'deposit', 'done'); // so the guard counts it
```

**`rateLimitGuard(opts)`** → a `FactGuard`. Same spirit as `lockoutGuard`, but counts **successes**:

| Field | Role | Default |
|---|---|---|
| `action` | the guarded (and counted) action, e.g. `'deposit'` | — (required) |
| `max` | maximum number of successful actions tolerated within the window | — (required) |
| `windowMs` | width of the sliding window, in milliseconds | — (required) |
| `successOutcome` | the `outcome` label counted as a success | `'fait'` |
| `name` | guard name (trace/audit) | `'rate:<action>'` |

> ⚠️ `rateLimitGuard` only **counts** what you record: it's up to you to call `vault.record(principal, action, successOutcome)` **after** each successful action (see the `vault.record('alice', 'deposit', 'done')` line). The guard does not increment itself. Note the default `successOutcome` is `'fait'`, so the example passes `'done'` explicitly on **both** the guard and the matching `record` — they must agree.

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

**`vault.addGuard(guard)`** → `void`. The `guard` is a `FactGuard` object:

| Field | Role | Default |
|---|---|---|
| `name` | guard identifier (trace/audit) | — (required) |
| `actions` | array of guarded actions; a guard with no `actions` applies to **all** actions | `undefined` (= all) |
| `check(ctx)` | the decision: returns `{ allow: boolean; reason?: string }` | — (required) |

The `ctx` (`GuardContext`) received by `check` contains: `kb` (the base), `principal`, `action`, `now` (ms timestamp), and `count(action, outcome, windowMs)` to count systematic facts.

> A guard can query anything via `ctx.kb` (facts, roles, balances through the ledger…) and
> `ctx.count(action, outcome, windowMs)` (the systematic facts). Protections are therefore
> **unlimited**: write as many as your domain requires.

## `FactAccessControl` — access groups & permissions (RBAC)

For an **organization**: group facts under **access groups**, define **CRUD** permissions
(read / write / update / delete), and **grant or revoke** access per member. Who can see what,
who can change what — at group granularity.

The fully-QPath principle: **permissions are themselves facts**. Granting means writing a fact;
revoking means retracting it (archived — the access history is complete and auditable). Rights
thus inherit everything QPath offers: traceable, **layerable** (a right set at the org level
covers all conversations via the scope stack) and queryable.

```ts
const acl = new FactAccessControl(kb, { requireDeclaredGroups: true });

// 0) DECLARE groups upfront (first-class entities, exist even when empty)
await acl.declareGroup('finance', { description: 'Financial data' });
acl.declaredGroups();   // [{ name:'finance', description:'…', factCount:0, declared:true }]

// 1) Group facts — in ONE call (writes + tags, returns the fact id)
const id = await acl.tellInGroup('budget', 'amount', '50000', 'finance');
//  → id === kb.factId('budget','amount','50000')  (the id is DETERMINISTIC: a hash of the
//    triplet, not a generated id — so kb.tell needn't "return" it, it's computable anytime)

// (two-step equivalent if you prefer: kb.tell(...) then acl.assign(...))

// 2) Grant / revoke (each right is a fact)
await acl.grant('alice', 'finance', 'read', 'write');   // alice: read + write
await acl.grant('admin', 'finance');                    // all permissions
acl.revoke('alice', 'finance', 'write');                // archived, not erased

// 3) Check & introspect
acl.can('alice', 'finance', 'read');                    // true
acl.permissionsOf('alice', 'finance');                  // ['read']
acl.membersWithAccess('finance', 'write');              // ['admin']  — who can write?
acl.groupsAccessibleBy('alice', 'read');                // ['finance']

// 4) Search facts by group
acl.factsInGroup('finance');                   // all facts in the group
acl.searchInGroup('finance', 'budget');        // full-text search within the group
acl.factsAccessibleBy('alice', 'read');        // every fact alice can read (across groups)

// 5) Governed operations (checked CRUD)
const { result, facts } = acl.read('bob', 'finance');   // result.allowed=false (bob not allowed)
await acl.write('admin', 'finance', 'bonus', 'is', '1000');        // ok → fact tagged "finance"
await acl.update('admin', 'finance', 'bonus', 'is', '1000', '1200');
acl.remove('admin', 'finance', 'bonus', 'is', '1200');            // retracted (archived)
```

**`new FactAccessControl(kb, opts?)`** — two arguments:
- `kb`: the `KnowledgeBase` where facts and rights live (permissions are themselves facts).
- `opts`: optional. Single field: `requireDeclaredGroups` (boolean, default `false`). When `true`, attaching a fact to an **undeclared** group is refused — `assign`/`tellInGroup` then return a failure until the group is created via `declareGroup`.

The methods used above, argument by argument:

| Call | Arguments | Return |
|---|---|---|
| `declareGroup(name, info?)` | `name` (required); `info?` = `{ description? }` (the description preserves case/accents for display) | `Promise<string>` (the normalized name) |
| `declaredGroups()` | none | `GroupInfo[]` = `{ name, description?, factCount, declared }[]`, sorted by name |
| `tellInGroup(s, p, o, group, source?)` | triplet `s/p/o` + `group`; `source?` = provenance (default `{ kind:'user', ref:'acl:group:<group>' }`) | `Promise<string>` — the fact's **deterministic id** (`kb.factId(s,p,o)`) |
| `grant(member, group, ...perms)` | `member`, `group`, then 0..N permissions; **no perms = ALL** (`read/write/update/delete`) | `Promise<void>` |
| `revoke(member, group, perm?)` | `perm?` omitted = revokes **all** permissions; archived, not erased | `void` |
| `can(member, group, perm)` | all three required | `boolean` |
| `permissionsOf(member, group)` | both required | `Permission[]` |
| `membersWithAccess(group, perm?)` | `perm?` default `'read'` | `string[]` (members) |
| `groupsAccessibleBy(member, perm?)` | `perm?` default `'read'` | `string[]` (groups) |
| `factsInGroup(group)` | `group` required | `EnumeratedFact[]` (secrets included, encrypted) |
| `searchInGroup(group, query)` | full-text s/p/o search within the group | `EnumeratedFact[]` |
| `factsAccessibleBy(member, perm?)` | `perm?` default `'read'` | `EnumeratedFact[]` (union of allowed groups) |

> 💡 **`Permission`** is one of `'read' | 'write' | 'update' | 'delete'`. `grant` accepts a variable number of permissions; passing them **all** is the same as passing **none** (`grant('admin', 'finance')`).

The governed operations (checked CRUD):

| Call | Arguments | Return |
|---|---|---|
| `read(member, group)` | both required | `{ result: AccessResult; facts: EnumeratedFact[] }` — `facts` empty if refused |
| `write(member, group, s, p, o, source?)` | triplet + `source?`; writes then tags the fact with the group | `Promise<AccessResult>` |
| `update(member, group, s, p, oldO, newO)` | replaces `oldO` with `newO` (the fact must already belong to the group) | `Promise<AccessResult>` |
| `remove(member, group, s, p, o)` | retracts (archives) the fact from the group | `AccessResult` |

Each `read/write/update/delete` checks the permission before acting and returns
`AccessResult` = `{ allowed: boolean; missing? }` (`missing` names the absent permission when
`allowed` is `false`). Since rights are facts, a full audit ("who granted write access to
finance, and when?") reads directly from provenance and history.

> ⚠️ `update`/`remove` return `{ allowed: false }` (without `missing`) if the targeted fact does **not** belong to the given group — the membership check precedes the permission check.


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
const ledger = new TransactionLedger(kb, { unit: 'USD' });

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

**The constructors and calls in the setup:**

- **`new XNeuroneGrid(encoder?, opts?)`** — `encoder?` is the function that encodes data into bit pairs (default: `BinaryConverter.toBinaryPairs`, hence `undefined`); `opts?` = `{ headless? }`, and `{ headless: true }` disables all rendering (Node/server).
- **`new KnowledgeBase(grid)`** — a single argument: the QPath grid used as working memory.
- **`new TransactionLedger(kb, opts?)`** — `kb` required; `opts?` accepts notably `{ unit, name?, description?, types?, now? }`. Full details on the [Ledger](transaction-ledger) page.
- **`vault.auditTrail(principal, action?)`** → an array of `{ action, outcome, at }` objects sorted by timestamp. `action?` omitted = **all** of the principal's actions.

> 🔒 The AES key (`randomBytes(32)`, 32 bytes) is passed to the `CipherPort` and **stays out of the graph**: QPath never stores the key, only the encrypted value. Losing the key makes the secrets unrecoverable — by design.

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
- **Transparent normalization**: the Vault re-encodes the ciphertext before storing it, so a
  secret survives intact (case, symbols, Unicode) regardless of the `CipherPort` — you have no
  format constraint on your cipher's output.
- **Safe re-verification**: when a fact is re-checked over time (reality may have moved on), the
  check **never overwrites** a secret or a **closed** decision — a re-verified secret is never
  rewritten in clear, and a closed fact is not downgraded. A legitimate rewrite **preserves** the
  structural flag (`major`), so the ontological backbone stays prioritized.
- **Durability**: built on a [`DurableKnowledgeBase`](/en/persistence#durable-kb-durableknowledgebase),
  the whole access layer (secrets, permissions, audit) is **persisted** to Postgres and survives a
  restart — without changing the code. The systematic facts become a durable audit log.

> ⚠️ A secret fact attached to an **access group** (`FactAccessControl`) is returned by
> `factsInGroup` / `read` in its **encrypted** form: the ACL governs group membership, while
> decryption stays exclusively the `FactVault`'s job (authenticated read). The two layers are
> intentionally orthogonal.
