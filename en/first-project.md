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

## 4. Log in

`vault.login` runs the guards (anti-bruteforce lockout), authenticates, and **emits a timestamped
audit fact** (success/failure) — for free.

```ts
async function login(email: string, password: string) {
  const r = await vault.login(`user:${email}`, password);
  return r.session;   // null if bad credentials or locked account
}
```

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
