# Transaction ledger

## `TransactionLedger` — transactional facts

An account / wallet modeled as an **append-only** ledger: each movement is an **immutable**
timestamped fact; the **balance is never stored**, it is computed by folding. The ledger enforces
**per-account constraints** and supports **transfers**.

> **Runnable showcase.** `npm run example:ledger` walks through a complete bank where **all** the
> logic — accounts, floor/ceiling, velocity limits, a **fraud rule added at runtime (no redeploy)**,
> a vaulted secret, audit — lives in **governed facts**: deterministic, traceable, atomic, with no
> hidden state. It is QPath's thesis in one scenario: *an application's behavior IS facts you query,
> govern and evolve.*

### Open an account (initial balance, floor, ceiling, velocity)

```ts
const ledger = new TransactionLedger(kb, { unit: 'USD' });

await ledger.open('12345_c', {
  initialBalance: 5000,   // opening endowment
  floor: -4000,           // overdraft allowed down to -4000
  ceiling: 1_000_000,     // maximum positive balance
  limits: [               // velocity: as many limits as you want
    { windowMs: 60_000,     kind: 'deposit',  maxAmount: 2000 }, // ≤ 2000 deposited / minute
    { windowMs: 86_400_000, kind: 'withdraw', maxCount: 3 },     // ≤ 3 withdrawals / day
  ],
});
```

**`new TransactionLedger(kb, options?)`** — the constructor takes two arguments:

- `kb` — the `KnowledgeBase` (or `DurableKnowledgeBase`) that stores the facts. **Required.** This is
  where durability comes from: a ledger built on a [`DurableKnowledgeBase`](/en/persistence#durable-kb-durableknowledgebase)
  becomes persistent and transactional **without changing the ledger code**.
- `options?` — the `LedgerOptions` (all optional; defaults to `{}`). See the table below.

| Option (`LedgerOptions`) | Role | Default |
|---|---|---|
| `name` | Ledger name (its role), e.g. "Checking accounts", "API credits" | — |
| `description` | Free-text description of what this ledger tracks | — |
| `unit` | **Default** unit of the quantities (`'USD'`, `'pts'`, `'kWh'`…). A ledger is not necessarily money | — (no unit) |
| `allowNegative` | May the balance go negative **with no explicit floor**? | `false` (implicit floor of `0`) |
| `floor` | Default floor (minimum balance), overridable per account | `0` (or `-∞` if `allowNegative`) |
| `ceiling` | Default ceiling (maximum balance), overridable per account | `+∞` |
| `limits` | **Global** velocity limits (added on top of each account's own) | `[]` |
| `types` | Pre-configured transaction types. Once any type is declared, it becomes **REQUIRED** | `[]` (none → type-free) |
| `now` | Clock provider (`() => number`, epoch ms) — handy in tests to freeze time | `() => Date.now()` |

**`ledger.open(account, config?)`** — opens/configures an account. Returns `Promise<void>`; **idempotent**.

| Argument | Role | Default |
|---|---|---|
| `account` | Account id (string; normalized by the KB) | **required** |
| `config.unit` | Unit of **this** account | inherits the ledger's `unit` |
| `config.initialBalance` | Opening endowment (written as an "opening" movement, **bypassing constraints**). Only if > 0 and the account is empty | `0` (no movement) |
| `config.floor` | Floor (minimum balance, e.g. `-4000` for overdraft). **Replaces** the old value on re-open | ledger's `floor` |
| `config.ceiling` | Ceiling (maximum balance). **Replaces** the old value on re-open | ledger's `ceiling` |
| `config.limits` | Velocity limits **specific** to this account (added to the global ones) | `[]` |

Each `limits` entry is a `VelocityLimit`:

| Field (`VelocityLimit`) | Role | Default |
|---|---|---|
| `windowMs` | Sliding-window size in ms | **required** |
| `kind` | Limited direction (`'deposit'` / `'withdraw'`) | absent = **both** |
| `maxAmount` | Maximum sum of amounts in the window | — (no amount bound) |
| `maxCount` | Maximum number of movements in the window | — (no count bound) |
| `label` | Human-readable label for the limit | — |

`windowMs` is free: 60_000 (minute), 3_600_000 (hour), 86_400_000 (day), ×7 (week), etc. A limit
bounds the **amount** (`maxAmount`) and/or the **count** (`maxCount`) of movements of one kind in
the window. Stack as many as the domain requires.

> 💡 The opening endowment (`initialBalance`) is written **bypassing constraints** and ignored by the
> velocity counters (its internal `ref` is `ouverture`): it does not consume a quota.

> `open()` is **idempotent** and **reconfigurable**: re-opening an account with a different floor
> or ceiling **replaces** the old value (the new one wins), without stacking a duplicate.

### PRE-CONFIGURED transaction types

Types are declared at construction. **Once at least one type is configured, it becomes REQUIRED**:
a deposit/withdrawal without a valid type is refused (`reason: 'invalid-type'`). A type may be
restricted to one kind.

```ts
const ledger = new TransactionLedger(kb, {
  unit: 'USD',
  types: [
    { name: 'salary', kind: 'deposit', label: 'Salary' },  // deposit only
    { name: 'rent',   kind: 'withdraw' },                  // withdrawal only
    { name: 'internal_transfer' },                       // no kind restriction
  ],
});
await ledger.ready;            // types are declared asynchronously
ledger.declaredTypes();        // [{ name:'rent', kind:'withdraw' }, …]
```

Each `types` entry is a `TransactionType`:

| Field (`TransactionType`) | Role | Default |
|---|---|---|
| `name` | Type id (normalized to lowercase) | **required** |
| `kind` | Restricts the type to one direction (`'deposit'` / `'withdraw'`) | absent = **both** (so usable in a transfer) |
| `label` | Display label, **case preserved** ("Salary") | — |

- **`ledger.ready`** — a `Promise<void>` (not a method). Since the constructor cannot `await`, global
  types are declared in the background; `await ledger.ready` guarantees they are before the first
  operation.
- **`ledger.declaredTypes()`** — no argument; returns a `TransactionType[]` sorted by `name`, rebuilt
  from the facts (the `label` comes back with its original casing).

> 💡 A type **with no `kind`** is the only one usable in a **transfer** (which spans both directions):
> `transfer` refuses (`reason: 'invalid-type'`) a type restricted to `'deposit'` or `'withdraw'`.

### Deposits, withdrawals, transfers (with metadata)

Every movement carries a **type**, its **author** (`by` = created_by) and its **date** (`at` =
created_at, automatic).

```ts
await ledger.deposit('12345_c', 2500, { type: 'salary', by: 'alice', ref: 'march' });
const r = await ledger.withdraw('12345_c', 200, { type: 'rent', by: 'alice' });
//  r.reason : 'invalid-type' | 'below-floor' | 'above-ceiling' | 'velocity-exceeded' | 'bad-amount'

// TRANSACTIONAL transfer: pre-validated on both sides; if a write fails, committed movements are
// RETRACTED (compensation) → balances restored. The type must be kind-unrestricted.
const v = await ledger.transfer('12345_c', '67890_c', 300, { type: 'internal_transfer', by: 'alice' });
//  v.reason : 'rolled-back' (compensation) | 'invalid-type' | … / v.side ('from' | 'to')

ledger.balance('12345_c');    // folded, never written
ledger.movements('12345_c');  // history: { kind, amount, type, by, at, ref } — the truth
```

**`ledger.deposit(account, amount, meta?)`** and **`ledger.withdraw(account, amount, meta?)`** share
the same shape and return a `Promise<PostResult>`:

| Argument | Role | Default |
|---|---|---|
| `account` | Target account | **required** |
| `amount` | **Positive** amount (≤ 0 or non-finite → `reason: 'bad-amount'`) | **required** |
| `meta.type` | Transaction type (**required** once any type is configured) | — |
| `meta.by` | Author (`created_by`) | — |
| `meta.ref` | Free-form reference (later filterable / searchable) | `ledger:<deposit\|withdraw>` |

**`ledger.transfer(from, to, amount, meta?)`** → `Promise<TransferResult>`:

| Argument | Role | Default |
|---|---|---|
| `from` | Debited account | **required** |
| `to` | Credited account | **required** |
| `amount` | Positive amount | **required** |
| `meta.type` | A **kind-unrestricted** type (no `kind`) if types are configured | — |
| `meta.by` | Author of both legs | — |
| `meta.ref` | Reference of both legs | `virement:<from>-><to>` |

**Return shapes.** `PostResult` = `{ ok, reason, movement?, balance }`: `ok` (boolean), `reason` (the
cause if refused, otherwise `null`), `movement` (the written movement on success), `balance` (the
balance **after** the operation). `TransferResult` = `{ ok, reason, side?, fromBalance, toBalance }`:
`side` (`'from'` | `'to'`) tells **which side** caused the refusal; `fromBalance`/`toBalance` are the
resulting balances of both accounts.

- **`ledger.balance(account)`** → `number` — current balance (deposits − withdrawals), rounded to the
  cent, **never stored** (folded from the movements).
- **`ledger.movements(account)`** → `Movement[]` — history sorted oldest-to-newest. Each `Movement` =
  `{ id, account, kind, amount, at, type?, by?, ref? }`.

> ⚠️ **Amounts** must be strictly positive; the direction (deposit vs withdrawal) comes from the
> method called, not the sign. A negative amount is refused (`bad-amount`); it does not "withdraw".

### Account lifecycle

An account is **active**, **blocked** (temporary freeze) or **closed** (terminal). An operation
on a non-active account is refused (`account-blocked` / `account-closed`).

```ts
await ledger.block('12345_c', 'suspected fraud');   // freeze → deposits/withdrawals/transfers refused
ledger.statusOf('12345_c');                         // 'blocked'
await ledger.unblock('12345_c');                    // back to 'active'

await ledger.close('12345_c');                      // TERMINAL: no operations, no unblock
```

- **`ledger.block(account, reason?)`** → `Promise<void>` — freezes the account. `reason` (optional) is
  the cause archived in the history; defaults to `'ledger:block'`. **No effect on a closed account.**
- **`ledger.unblock(account)`** → `Promise<void>` — one argument; sets the account back to `'active'`.
  No effect unless the account is `'blocked'`.
- **`ledger.close(account, reason?)`** → `Promise<void>` — closes permanently (**terminal** state: no
  unblock possible). `reason` defaults to `'ledger:close'`.
- **`ledger.statusOf(account)`** → `AccountStatus` (`'active'` | `'blocked'` | `'closed'`); an account
  never modified returns `'active'`.

> Status changes are themselves facts (retracted/archived on each transition): the account's
> history — when it was blocked, by whom, why — is auditable.

### Enumerate: accounts & movements (pagination, filters, search)

Every account opened (or merely touched by a movement) becomes **enumerable**. Lists return a
`Page<T>`: `{ items, total, offset, limit, hasMore }` — `total` is the count **before** slicing,
so you can compute the number of pages.

```ts
// Accounts: search by id, filters (status / unit / balance), sort, pagination
const page = ledger.accounts({
  search: 'cli_',           // substring in the id
  status: 'active',         // 'active' | 'blocked' | 'closed'
  unit: 'HTG',
  minBalance: 1000, maxBalance: 50_000,
  sort: 'balance', desc: true,   // 'id' | 'balance' | 'movements'
  offset: 0, limit: 20,
});
page.items;   // [{ id, balance, unit, status, movementCount, floor, ceiling }, …]
page.total;   // number of accounts matching the filter
page.hasMore; // is there a next page?

ledger.account('cli_bob');     // summary of ONE account, or undefined
ledger.hasAccount('cli_bob');  // exists?

// Movements: deposits / withdrawals filtered and paginated
ledger.deposits('cli_bob', { offset: 0, limit: 50 });       // shortcut kind='deposit'
ledger.withdrawals('cli_bob', { since: t0, until: t1 });    // shortcut kind='withdraw'
ledger.movementsPage('cli_bob', {
  kind: 'withdraw', type: 'rent', by: 'alice',
  ref: 'march', search: 'transfer',  // full-text search over id/ref/type/author
  since: t0, until: t1,             // time bounds (epoch ms)
  desc: true, offset: 0, limit: 100, // newest first
});

ledger.movementById('mv:cli_bob:withdraw:200:1700000000000:0'); // direct lookup, or undefined
```

**`ledger.accounts(query?)`** → `Page<AccountSummary>`. All options are optional (`{}` lists
everything):

| Option (`AccountQuery`) | Role | Default |
|---|---|---|
| `search` | Substring matched against the account **id** | — (no filter) |
| `status` | `'active'` \| `'blocked'` \| `'closed'` | — |
| `unit` | Keep only accounts of this unit | — |
| `minBalance` / `maxBalance` | Balance bounds (inclusive) | — |
| `sort` | Sort key: `'id'` \| `'balance'` \| `'movements'` | `'id'` |
| `desc` | Descending order | `false` |
| `offset` | Pagination offset | `0` |
| `limit` | Page size | absent = **everything** (no truncation) |

`Page<T>` = `{ items, total, offset, limit, hasMore }`: `total` is the count **before** slicing (to
compute the number of pages), `hasMore` says whether a next page remains. `AccountSummary` =
`{ id, balance, unit?, status, movementCount, floor, ceiling }`.

**`ledger.movementsPage(account, query?)`** → `Page<Movement>`. `account` required, options:

| Option (`MovementQuery`) | Role | Default |
|---|---|---|
| `kind` | `'deposit'` \| `'withdraw'` | — (both) |
| `type` | Filter by transaction type | — |
| `by` | Filter by author | — |
| `ref` | Substring within the **reference** | — |
| `since` / `until` | Time bounds in epoch ms (inclusive) | — |
| `search` | Full-text search over `id` / `ref` / `type` / author | — |
| `desc` | Newest first | `false` (oldest first) |
| `offset` / `limit` | Pagination | `0` / everything |

- **`ledger.deposits(account, query?)`** / **`ledger.withdrawals(account, query?)`** — shortcuts for
  `movementsPage` with `kind` forced to `'deposit'` / `'withdraw'` (the `kind` you pass is overridden).
- **`ledger.account(account)`** → `AccountSummary | undefined` — summary of **one** account
  (`undefined` if it does not exist). One argument.
- **`ledger.hasAccount(account)`** → `boolean` — has the account been registered (opened or touched)?
- **`ledger.movementById(id)`** → `Movement | undefined` — direct lookup by movement id, across all
  accounts.

> Everything is **computed**, never denormalized: a balance and a page's count are folded on the
> fly from the immutable movements — no counter to maintain, so nothing to desync.

> **Transfer transactionality.** The `(account, movement, id)` link is written LAST: it is the
> commit point. A half-written movement is never counted — each write is thus atomic for the
> balance, and a transfer that fails midway **retracts** (compensation, saga) what was committed,
> restoring the balances (`reason: 'rolled-back'`).
>
> **Every movement is unique.** Two identical movements (same account, same kind, same amount) at
> the **same millisecond** no longer collapse: each carries its own identifier and counts
> separately in the balance — no more silent loss of the second one.
>
> **Guarantee boundary.** Strong consistency under CONCURRENCY (two simultaneous transfers on the
> same account) or a machine crash between the two writes remains the host's responsibility: for
> real value, back this model with a transactional system of record. QPath models the ledger; it
> does not replace a banking core.

### Durability & ACID (durable KB)

Build the ledger on a [`DurableKnowledgeBase`](/en/persistence#durable-kb-durableknowledgebase)
(backed by a Postgres `FactStore`) and it becomes **persistent and transactional** without changing
a line of your ledger code:

- movements are **write-through** to the database (they survive a restart — on reload, `hydrate()`
  replays the history and balances are identical);
- `transfer` runs both legs in **one database transaction** (commit/rollback) → the "guarantee
  boundary" above is lifted: real store-level atomicity.

```ts
const kb = new DurableKnowledgeBase(grid, factStore, `ledger:${userId}`);
await kb.hydrate();
const ledger = new TransactionLedger(kb);   // unchanged — durability comes from the KB
await ledger.transfer('a', 'b', 200);        // atomic at the DB when the KB is durable
```

**`new DurableKnowledgeBase(grid, factStore, scope)`** — three arguments (detailed in
[Persistence](/en/persistence#durable-kb-durableknowledgebase)): `grid` (the in-memory QPath graph),
`factStore` (where the facts are actually persisted) and `scope` (the key that isolates this memory,
e.g. `ledger:42`). `await kb.hydrate()` reloads the durable state on startup.

> 💡 Here `new TransactionLedger(kb)` is called **with no options**: it inherits the default
> units/constraints. The durability and atomicity of `transfer` come **solely** from the durable
> `kb` — the ledger code is strictly the same as in memory.
