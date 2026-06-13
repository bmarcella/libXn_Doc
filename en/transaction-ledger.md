# Transaction ledger

## `TransactionLedger` — transactional facts

An account / wallet modeled as an **append-only** ledger: each movement is an **immutable**
timestamped fact; the **balance is never stored**, it is computed by folding. The ledger enforces
**per-account constraints** and supports **transfers**.

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

`windowMs` is free: 60_000 (minute), 3_600_000 (hour), 86_400_000 (day), ×7 (week), etc. A limit
bounds the **amount** (`maxAmount`) and/or the **count** (`maxCount`) of movements of one kind in
the window. Stack as many as the domain requires.

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

### Account lifecycle

An account is **active**, **blocked** (temporary freeze) or **closed** (terminal). An operation
on a non-active account is refused (`account-blocked` / `account-closed`).

```ts
await ledger.block('12345_c', 'suspected fraud');   // freeze → deposits/withdrawals/transfers refused
ledger.statusOf('12345_c');                         // 'blocked'
await ledger.unblock('12345_c');                    // back to 'active'

await ledger.close('12345_c');                      // TERMINAL: no operations, no unblock
```

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

ledger.movementById('mv:cli_bob:withdraw:200:1700000000000'); // direct lookup, or undefined
```

> Everything is **computed**, never denormalized: a balance and a page's count are folded on the
> fly from the immutable movements — no counter to maintain, so nothing to desync.

> **Transfer transactionality.** The `(account, movement, id)` link is written LAST: it is the
> commit point. A half-written movement is never counted — each write is thus atomic for the
> balance, and a transfer that fails midway **retracts** (compensation, saga) what was committed,
> restoring the balances (`reason: 'rolled-back'`).
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
