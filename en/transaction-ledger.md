# Transaction ledger

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

### PRE-CONFIGURED transaction types

Types are declared at construction. **Once at least one type is configured, it becomes REQUIRED**:
a deposit/withdrawal without a valid type is refused (`reason: 'invalid-type'`). A type may be
restricted to one kind.

```ts
const ledger = new TransactionLedger(kb, {
  currency: 'USD',
  types: [
    { name: 'salary', kind: 'depot', label: 'Salary' },  // deposit only
    { name: 'rent',   kind: 'retrait' },                 // withdrawal only
    { name: 'internal_transfer' },                       // no kind restriction
  ],
});
await ledger.ready;            // types are declared asynchronously
ledger.declaredTypes();        // [{ name:'rent', kind:'retrait' }, …]
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

> **Transfer transactionality.** The `(account, movement, id)` link is written LAST: it is the
> commit point. A half-written movement is never counted — each write is thus atomic for the
> balance, and a transfer that fails midway **retracts** (compensation, saga) what was committed,
> restoring the balances (`reason: 'rolled-back'`).
>
> **Guarantee boundary.** Strong consistency under CONCURRENCY (two simultaneous transfers on the
> same account) or a machine crash between the two writes remains the host's responsibility: for
> real value, back this model with a transactional system of record. QPath models the ledger; it
> does not replace a banking core.
