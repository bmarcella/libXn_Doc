# First project: a **conversational** bank (LibXN + Express)

We build a bank where the user **signs up** (identity + secret via the access layer), **logs in**,
**opens a USD account**, and does **everything else by chatting** — no forms. They type
*"open me a dollar account"*, *"send $25 to Bob"*, *"my balance?"*.

## The principle: the LLM understands, the deterministic core holds the truth

> 🧠 **The LLM** turns language into an **intent** (understanding the request).
> ⚙️ **QPath (deterministic)** executes and answers: balances, movements, transfers. **Money is
> never decided by the LLM** — it only routes. A refused transfer (insufficient funds) stays refused,
> however nicely it's phrased.

## 1. Install

```bash
npm install express @damba/libxn
```

## 2. Setup (at startup)

The store, the durable KB, the ledger, and the identity vault — created **once** at boot.
(In production, `factStore` = a Postgres adapter; see [Persistence › Create a store](/en/persistence#create-a-store).)

```ts
import { createHash, randomBytes } from 'crypto';
import {
  DurableKnowledgeBase, FactVault, InMemoryFactStore, TransactionLedger, XNeuroneGrid,
  lockoutGuard, type FactAuthenticator,
} from '@damba/libxn';

const factStore = new InMemoryFactStore();                       // dev ; prod = Postgres
// undefined = default encoder ; headless = no rendering (Node/server)
const grid = new XNeuroneGrid(undefined, { headless: true });
const bank = new DurableKnowledgeBase(grid, factStore, 'bank');  // ONE scope = atomic transfers
await bank.hydrate();

// The ledger isn't "money only": we name it and set a default unit.
const ledger = new TransactionLedger(bank, { name: 'Customer accounts', unit: 'USD' });

// How a password is verified = YOUR hashing (the access layer hard-codes nothing).
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const authenticator: FactAuthenticator = {
  async authenticate(principal, password) {
    const ok = bank.ask(principal, 'password_hash')[0] === sha(password);
    return ok ? { principal, issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 } : null;
  },
  verify: (s) => !s.expiresAt || s.expiresAt > Date.now(),
};
const vault = new FactVault(bank, { authenticator });
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 })); // anti-bruteforce
```

**`new XNeuroneGrid(encoder?, opts?)`** — the in-memory QPath graph (working memory). Two arguments, both optional:

| Argument | Role | Default |
|---|---|---|
| `encoder?` | a `(data) => [number, number][]` function encoding input into bit pairs | `undefined` → default encoder (`BinaryConverter.toBinaryPairs`) — hence the explicit `undefined` |
| `opts?` | options; only `headless?: boolean` is read | `{}`; `headless: true` = **no rendering** (Node/server), use it on the backend |

**`new DurableKnowledgeBase(grid, store, scope)`** — the durable KB. Three required arguments:

| Argument | Role | Default |
|---|---|---|
| `grid` | the `XNeuroneGrid` (the in-memory graph) | — |
| `store` | the `FactStore` where facts are **actually persisted** (here `InMemoryFactStore`, a Postgres adapter in production) | — |
| `scope` | the **isolation key** for this memory (here `'bank'`); two scopes never see each other | — |

**`new TransactionLedger(kb, opts?)`** — the ledger backed by the KB. `kb` required; `opts` (`LedgerOptions`) optional. Fields used here:

| Option | Role | Default |
|---|---|---|
| `name?` | name/role of the ledger (`'Customer accounts'`) | — |
| `unit?` | **default** unit of amounts (`'USD'`) — a ledger isn't necessarily money (`pts`, `kWh`…) | — |
| `types?` / `floor?` / `ceiling?` / `limits?` / `allowNegative?` / `now?` | pre-configured types, floor/ceiling, velocity limits, allow-negative, injectable clock | — |

**`new FactVault(kb, opts?)`** — the access layer (secrets + audit). `kb` required; `opts` optional:

| Option | Role | Default |
|---|---|---|
| `authenticator?` | your `FactAuthenticator` (checks the password, issues a `Session`) | `undefined` |
| `cipher?` | at-rest encryption of secrets (`CipherPort`) | `PlaintextCipher` (⚠️ no real encryption) |
| `now?` | injectable clock (audit/timestamps) | `() => Date.now()` |
| `insecureAllowUnauthenticated?` | dev/test only: accept any session without an `authenticator` | `false` (fail-closed) |

> 🔒 **Fail-closed.** Without an `authenticator`, no session reveals a secret. `insecureAllowUnauthenticated: true` opens the vault to any session — **never in production**.

A `FactAuthenticator` (an interface **you** implement) has two methods: `authenticate(principal, credential)` returns a `Session` (`{ principal, issuedAt, expiresAt?, token? }`) or `null` on rejection, and `verify(session)` tells whether the session is still valid.

**`lockoutGuard(opts)`** returns a `FactGuard` (anti-bruteforce lockout). Options:

| Option | Role | Default |
|---|---|---|
| `action` | the watched action (`'login'`) | — (required) |
| `maxFailures` | failures before locking | — (required) |
| `windowMs` | sliding window in ms (`15 * 60_000` = 15 min) | — (required) |
| `failureOutcome?` | label of the outcome counted as a failure | `'échec'` |
| `name?` | guard name | `lockout:<action>` |

`vault.addGuard(guard)` registers that guard (a single argument, the `FactGuard` returned above).

## 3. Sign up — identity + secret (access layer)

Signup stores the **identity** (ordinary facts), the password **hash** (never in clear) and a
**secret** encrypted at rest (API key), hidden from normal reads.

```ts
async function signup(email: string, password: string) {
  const userId = `user:${email}`;
  if (bank.ask(userId, 'password_hash').length) throw new Error('already signed up');

  await bank.tell(userId, 'email', email);                 // identity
  await bank.tell(userId, 'password_hash', sha(password)); // never the clear password
  await vault.setSecret(userId, 'api_key', randomBytes(16).toString('hex')); // encrypted secret
  await bank.flush();
  return userId;
}
```

The KB write/read calls:

- **`bank.ask(s, p)`** → `string[]`: every object known for the (subject `s`, predicate `p`) pair. **Empty** array if nothing — hence `.length` to test existence. Two required arguments.
- **`bank.tell(s, p, o, source?, flags?)`** → records the fact `(s, p, o)` (write-through: persisted on its own). `source?` = provenance (`{ kind, ref? }`, default `{ kind: 'user' }`); `flags?` = flags (`{ secret?, closed?, major?… }`). Returns a contradiction report or `null`.
- **`vault.setSecret(s, p, plainO, source?)`**: writes `(s, p, plainO)` **encrypted at rest** and flagged `secret` (hidden from normal reads). `plainO` is the **clear** value (encryption is applied for you); `source?` optional (default `{ kind: 'user', ref: 'vault' }`).
- **`bank.flush()`**: waits until deferred writes have landed in the store (writes are flushed in the background — `flush` guarantees durability before continuing).

## 4. Log in

`vault.login` runs the guards (anti-bruteforce lockout), authenticates, and **emits a timestamped
audit fact** (success/failure) — for free.

```ts
async function login(email: string, password: string) {
  const r = await vault.login(`user:${email}`, password);
  return r.session;   // null if bad credentials or locked account
}
```

**`vault.login(principal, credential)`** — two required arguments: the identity (`principal`, here `user:<email>`) and the proof (`credential`, the clear password). Returns a `LoginResult` `{ session, reason, guardReason? }`:

- `session`: the `Session` issued by your `authenticator`, or **`null`** on failure;
- `reason`: `'bad-credential'` (wrong credentials), `'denied'` (refused by a guard, e.g. lockout) or `null` on success;
- `guardReason?`: detailed reason when a guard refuses.

## 5. Everything else — **by chatting**

The core: a free message → the LLM extracts an **intent** → the **deterministic** core executes it.

```ts
const llm = async (prompt: string): Promise<string> => /* call YOUR model (Claude, GPT…) */ '';
const money = (cents: number) => (cents / 100).toFixed(2);
const accId = (userId: string, unit: string) => `${userId}:${unit.toLowerCase()}`;

// 1) THE LLM UNDERSTANDS: text → { action, unit?, amount?, to?, ref? }
async function understand(message: string) {
  const prompt = `Convert this banking request to JSON, and NOTHING else.
Schema: {"action":"open|deposit|transfer|balance|history|other","unit"?:"usd","amount"?:<cents>,"to"?:"<account>","ref"?:"<text>"}
Request: "${message}"`;
  return JSON.parse(await llm(prompt)) as {
    action: string; unit?: string; amount?: number; to?: string; ref?: string;
  };
}

// 2) THE DETERMINISTIC CORE EXECUTES — money goes ONLY through the validated ledger
async function handle(userId: string, message: string): Promise<string> {
  const i = await understand(message);
  const unit = i.unit ?? 'usd';
  const acc = accId(userId, unit);

  switch (i.action) {
    case 'open':
      await ledger.open(acc, { unit });
      await bank.flush();
      return `${unit.toUpperCase()} account opened ✅`;

    case 'deposit': {
      const r = await ledger.deposit(acc, i.amount!, { ref: i.ref });
      await bank.flush();
      return r.ok ? `Deposit done. Balance: ${money(r.balance)} ${unit.toUpperCase()}.` : `Refused (${r.reason}).`;
    }

    case 'transfer': {
      const r = await ledger.transfer(acc, accId(i.to!, unit), i.amount!, { ref: i.ref });
      await bank.flush();
      return r.ok ? `Transfer done. Balance: ${money(r.fromBalance)}.` : `Refused (${r.reason}).`;
    }

    case 'balance':                                   // ← 100% deterministic, never the LLM
      return `Your balance is ${money(ledger.balance(acc))} ${unit.toUpperCase()}.`;

    case 'history':                                   // ← truth, straight from the ledger
      return ledger.movementsPage(acc, { limit: 5, desc: true })
        .items.map(m => `• ${m.kind} ${money(m.amount)} ${m.ref ? `(${m.ref})` : ''}`).join('\n') || 'No movement.';

    default:
      return 'I can: open an account, deposit, transfer, give your balance or your history.';
  }
}
```

The ledger operations used here:

**`ledger.open(account, cfg?)`** → `Promise<void>`: declares an account. `account` required; `cfg` (`AccountConfig`) optional — `unit?` (else the ledger's default unit), `initialBalance?`, `floor?` (default `0`), `ceiling?`, `limits?`.

**`ledger.deposit(account, amount, meta?)`** → `Promise<PostResult>`: credits `amount`. `meta` optional (`{ type?, by?, ref? }`). The result:

| Field | Meaning |
|---|---|
| `ok` | was the operation accepted? |
| `reason` | refusal reason (`'below-floor'`, `'above-ceiling'`, `'velocity-exceeded'`…) or `null` on success |
| `balance` | balance **after** the operation |
| `movement?` | the created movement (if accepted) |

**`ledger.transfer(from, to, amount, meta?)`** → `Promise<TransferResult>`: debits `from`, credits `to`, **pre-validated on both sides** (all or nothing). Four arguments (`meta?` optional). The result:

| Field | Meaning |
|---|---|
| `ok` | transfer accepted? |
| `reason` | refusal reason or `null` |
| `side?` | offending side on refusal (`'from'` / `'to'`) |
| `fromBalance` / `toBalance` | both account balances after the operation |

**`ledger.balance(account)`** → `number`: balance **recomputed** by folding movements (never stored). A single argument.

**`ledger.movementsPage(account, query?)`** → `Page<Movement>`: a page of movements. `query` (`MovementQuery`) optional — here `{ limit: 5, desc: true }` (5 most recent first). Useful fields: `limit?`/`offset?` (pagination), `kind?` (`'deposit'`/`'withdraw'`), `desc?` (most recent first). The `Page<Movement>` return exposes `items` (the array of `Movement` `{ id, kind, amount, at, ref?… }`), `total` (before slicing), `offset`, `limit`, `hasMore`.

### The Express API

```ts
import express from 'express';
const app = express();
app.use(express.json());
const wrap = (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/signup', wrap(async (req, res) =>
  res.status(201).json({ userId: await signup(req.body.email, req.body.password) })));

app.post('/login', wrap(async (req, res) => {
  const session = await login(req.body.email, req.body.password);
  session ? res.json({ token: issueToken(session) }) : res.status(401).json({ error: 'invalid credentials' });
}));

// Everything goes through chat — `requireAuth` validates the token and sets req.userId.
app.post('/chat', requireAuth, wrap(async (req, res) =>
  res.json({ reply: await handle(req.userId, req.body.message) })));

app.listen(3000, () => console.log('🏦 Conversational bank → http://localhost:3000'));
```

### The dialogue

```text
POST /chat  "open me a dollar account"       → "USD account opened ✅"
POST /chat  "deposit 100 dollars"            → "Deposit done. Balance: 100.00 USD."
POST /chat  "send 25 dollars to user:bob@x"  → "Transfer done. Balance: 75.00."
POST /chat  "what's my balance?"             → "Your balance is 75.00 USD."
POST /chat  "my last operations"             → "• withdraw 25.00 … • deposit 100.00 …"
```

## Why it's safe

- The LLM **never decides** a balance or a transfer: it produces an *intent*, that's all.
- Every money operation goes through `ledger`, which **validates** (floor, ceiling, velocity, status)
  and is **atomic** on a durable KB. A refusal stays a refusal.
- Factual answers (`balance`, `history`) come **straight from the deterministic ledger** — zero
  hallucination. The same question always gives the same verifiable answer.

## Best practices

1. **A scope = a transactional boundary** (the whole bank → atomic transfers).
2. **`hydrate()` at startup**, **`flush()` after each write**.
3. **Identity & secrets via the access layer**: hash for the password (never in clear), `setSecret`
   for reversible values (encrypted, hidden); anti-bruteforce guard.
4. **LLM to understand, deterministic core to execute** — money never depends on the model.
5. **Money in integers** (cents).

## Going further

- **Deterministic reasoning** beyond the ledger: rules (`RuleEngine`), chains (`ChainResolver`),
  inverse questions ("who did I pay?") — all without an LLM. See [Components](/en/components).
- **Types & caps**: pre-configured `types` and velocity `limits` — see [Ledger](/en/transaction-ledger).
- **Audit**: `vault.auditTrail(principal)` replays every login (success/failure).
- **Production**: `factStore` = an adapter connected to your database; you create the connection,
  LibXN only sees the interface — see [Persistence › Create a store](/en/persistence#create-a-store).
