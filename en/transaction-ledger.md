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

### Deposits, withdrawals, transfers

```ts
await ledger.deposit('12345_c', 1000);
const r = await ledger.withdraw('12345_c', 200);
//  r.ok / r.reason : 'below-floor' | 'above-ceiling' | 'velocity-exceeded' | 'bad-amount'

// TRANSACTIONAL transfer: pre-validated on both sides; and if a write fails midway, the already
// committed movements are RETRACTED (compensation) → balances restored.
const v = await ledger.transfer('12345_c', '67890_c', 300, 'rent');
//  v.ok / v.reason ('rolled-back' on compensation) / v.side ('from' | 'to') / v.fromBalance / v.toBalance

ledger.balance('12345_c');    // folded, never written
ledger.movements('12345_c');  // the history IS the truth
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
