# First project: a banking API with LibXN + Express

We build a small **banking API** end to end: open accounts, deposit, withdraw, make **atomic
transfers**, read balances and history. All **durable** (survives a restart) and **transactional** (a
transfer succeeds in full or not at all).

A great way to see LibXN **best practices** on a real case.

## 1. Install

```bash
npm init -y
npm install express @damba/libxn
```

## 2. The store (where facts are persisted)

`DurableKnowledgeBase` needs a **store**. In development the core's in-memory implementation is
enough; in production you inject a Postgres adapter (see [Persistence](/en/persistence) — the rest of
your code doesn't change).

```ts
import { InMemoryFactStore } from '@damba/libxn';

const factStore = new InMemoryFactStore();   // dev/test ; prod = Postgres adapter
```

## 3. The business core: a durable ledger

```ts
import { DurableKnowledgeBase, TransactionLedger, XNeuroneGrid } from '@damba/libxn';

// 🔑 BEST PRACTICE — a SINGLE scope for the bank.
// All accounts live in the same "bank" scope, so a transfer between two accounts
// is ATOMIC (it runs in one transaction). Two accounts in different scopes could
// NOT be transferred atomically.
const grid = new XNeuroneGrid(undefined, { headless: true });
const bank = new DurableKnowledgeBase(grid, factStore, 'bank');

const ledger = new TransactionLedger(bank, { currency: 'USD' });

await bank.hydrate();   // at startup: reload durable state from the store
```

> 💡 **Amounts in the smallest unit.** Store sums as **integers** (cents), never floats — `1050` for
> $10.50. No rounding error on money.

## 4. The Express API

```ts
import express from 'express';

const app = express();
app.use(express.json());

// 🔑 BEST PRACTICE — a business rejection is not an exception: it's DATA
// (`{ ok, reason }`). Map the reason to the right HTTP status.
const REASON_STATUS: Record<string, number> = {
  'bad-amount': 400, 'invalid-type': 400, 'unknown-account': 404,
  'below-floor': 422, 'above-ceiling': 422, 'velocity-exceeded': 429,
  'account-blocked': 409, 'account-closed': 409, 'rolled-back': 500,
};

// Small wrapper: catch async errors (Express 4 doesn't on its own).
const wrap = (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Open an account
app.post('/accounts', wrap(async (req, res) => {
  const { id, owner, initialBalance = 0, floor = 0 } = req.body;
  await ledger.open(id, { initialBalance, floor });
  await bank.tell(id, 'owner', owner);   // free metadata: who owns the account
  await bank.flush();                     // 🔑 durability GUARANTEED before responding
  res.status(201).json(ledger.account(id));
}));

// Deposit
app.post('/accounts/:id/deposit', wrap(async (req, res) => {
  const r = await ledger.deposit(req.params.id, req.body.amount, { ref: req.body.ref });
  await bank.flush();
  if (!r.ok) return res.status(REASON_STATUS[r.reason!] ?? 400).json({ error: r.reason });
  res.json({ balance: r.balance });
}));

// Withdraw (refused if it would go below the floor)
app.post('/accounts/:id/withdraw', wrap(async (req, res) => {
  const r = await ledger.withdraw(req.params.id, req.body.amount, { ref: req.body.ref });
  await bank.flush();
  if (!r.ok) return res.status(REASON_STATUS[r.reason!] ?? 400).json({ error: r.reason });
  res.json({ balance: r.balance });
}));

// ATOMIC transfer — debit + credit, all or nothing
app.post('/transfer', wrap(async (req, res) => {
  const { from, to, amount, ref } = req.body;
  const r = await ledger.transfer(from, to, amount, { ref });
  await bank.flush();
  if (!r.ok) return res.status(REASON_STATUS[r.reason!] ?? 400).json({ error: r.reason, side: r.side });
  res.json({ fromBalance: r.fromBalance, toBalance: r.toBalance });
}));

// Balance + owner (combine the ledger summary and a business fact)
app.get('/accounts/:id', wrap(async (req, res) => {
  const acc = ledger.account(req.params.id);
  if (!acc) return res.status(404).json({ error: 'unknown-account' });
  res.json({ ...acc, owner: bank.ask(req.params.id, 'owner')[0] });
}));

// Paginated history (newest first)
app.get('/accounts/:id/movements', wrap(async (req, res) => {
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || 20;
  res.json(ledger.movementsPage(req.params.id, { offset, limit, desc: true }));
}));

app.listen(3000, () => console.log('🏦 Bank API → http://localhost:3000'));
```

## 5. Try it

```bash
# open two accounts
curl -X POST localhost:3000/accounts -H 'content-type: application/json' \
  -d '{"id":"acc_alice","owner":"Alice","initialBalance":100000}'
curl -X POST localhost:3000/accounts -H 'content-type: application/json' \
  -d '{"id":"acc_bob","owner":"Bob"}'

# transfer $250.00 (in cents)
curl -X POST localhost:3000/transfer -H 'content-type: application/json' \
  -d '{"from":"acc_alice","to":"acc_bob","amount":25000,"ref":"rent"}'

# balances
curl localhost:3000/accounts/acc_alice     # balance: 75000
curl localhost:3000/accounts/acc_bob       # balance: 25000
```

Stop and restart the server: `hydrate()` replays the store, **the balances are still there**.

## Best practices, in short

1. **A scope = a transactional boundary.** Put in the same scope everything that must be
   transferable atomically (here, the whole bank). Split scopes to isolate (one per customer if
   inter-customer transfers aren't needed).
2. **`hydrate()` once at startup**, then reuse the same KB / ledger instance.
3. **`flush()` after each write** before responding — the caller is sure it's durable.
4. **Business returns data, not exceptions** (`{ ok, reason }`) → map `reason` to HTTP.
5. **Balances are never stored**: they're recomputed from immutable movements. Nothing to desync.
6. **Money in integers** (cents).
7. **Remember any account attribute** with a simple `tell` (here `owner`) — the KB is also your
   metadata store.

## Going further

- **Transaction types & caps**: configure `types` and velocity `limits` at open (e.g. "max 3
  withdrawals/day") — see [Ledger](/en/transaction-ledger).
- **Authentication & secrets**: protect an account with a PIN via `FactVault` (hashed/encrypted,
  lockout after N failures) — see [Access layer](/en/access-layer).
- **Lifecycle**: `ledger.block()` / `unblock()` / `close()` to freeze or close an account.
- **Production**: replace `new InMemoryFactStore()` with the injected Postgres adapter, call
  `initLibxnSchema()` at startup, scope per customer/organization — see
  [Persistence](/en/persistence).
