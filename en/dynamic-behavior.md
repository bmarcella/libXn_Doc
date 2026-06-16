# Dynamic behavior

A mode where **the application's behavior lives in facts**, not in frozen code. The control flow —
conditions, switches, loops, actions — is stored as ordinary facts, and an executor walks them.
**Adding a fact = changing behavior, with no redeploy.**

```
welcome entry check
check si "user est premium"
check alors message_premium
check sinon message_basic
message_premium action notify
message_premium arg.text "Welcome, premium member."
```

The same flow produces two behaviors from **a single fact**: adding `user est premium` routes to
the premium branch. All of it **deterministic, traced, at 0 tokens**.

(Reserved predicate names are kept in French to match the engine's vocabulary.)

## What it can do

| Construct | Role | Example |
|-----------|------|---------|
| **Condition** | branch on a fact | `si "user est premium"` → `alors` / `sinon` |
| **Numeric condition** | compare a value | `si "user age >= 18"` |
| **Switch** | route on a value | `switch "user plan"` → `cas.gold` / `défaut` |
| **Bounded loop** | iterate over a collection | `pour_chaque "panier article"`, `max_iter 50` |
| **Action** | trigger a capability | `action notify` + arguments |

Every run returns its **full trace** — which step, triggered by which fact — like everything else
in the memory: auditable.

## Conventions

Everything is an ordinary triplet; only the **predicates** are conventional:

- `entree` — a flow's entry point;
- `si` / `alors` / `sinon` — the condition (evaluated by a **memory read**, hence 0 tokens);
- `switch` / `cas.<value>` / `défaut` — the switch;
- `pour_chaque` / `corps` / `max_iter` — the loop (always **bounded**);
- `action` / `arg.<key>` / `puis` — the action and what comes next.

**Actions** are the only side-effecting brick: they trigger a declared **tool** (search, compute,
send…). Adding a step recomposes existing capabilities; it does not invent a new one — for that,
you register a new tool.

## In practice

A flow lives in **facts**; an executor walks them. You wire a memory, declare the tools (the
side-effecting capabilities), set the flow's facts, then run it — the output is a deterministic
**trace**, with no LLM.

```ts
import {
  XNeuroneGrid, KnowledgeBase, LayeredKnowledgeBase,
  FlowRunner, ToolRegistry, promoteFacts, rollbackRelease,
} from '@damba/libxn';

// 1. A tool = a real capability (here a simple "log"; wire email, http, db…)
const tools = new ToolRegistry().register({
  name: 'log',
  description: 'Prints a message',
  run: async (input) => ({ text: String(input['msg'] ?? '') }),
});

// 2. PROD: the flow lives in facts (condition → action)
const prod = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await prod.tell('accueil', 'entree', 'verif');
await prod.tell('verif', 'si', 'user est premium');
await prod.tell('verif', 'alors', 'msg_premium');
await prod.tell('verif', 'sinon', 'msg_basique');
await prod.tell('msg_premium', 'action', 'log');
await prod.tell('msg_premium', 'arg.msg', 'Welcome, premium member.');
await prod.tell('msg_basique', 'action', 'log');
await prod.tell('msg_basique', 'arg.msg', 'Welcome.');

// 3. Run it: you get the trace (deterministic, traced, 0 LLM)
const trace = await new FlowRunner(prod, tools).run('accueil');
console.log(trace);  // → "msg_basique" branch (no premium fact in memory)

// 4. DEV: an overlay on top of PROD. ONE added fact reroutes the flow,
//    the running PROD is NOT touched.
const dev = new LayeredKnowledgeBase(
  new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true })),
  [prod],
);
await dev.tell('user', 'est', 'premium');
await new FlowRunner(dev, tools).run('accueil');  // → "msg_premium" branch

// 5. Promote the validated DEV → PROD fact (tagged release), reversible.
await promoteFacts(dev.primary, prod, 'v1');  // PROD switches to premium
rollbackRelease(prod, 'v1');                  // back to the previous (archived) state
```

Each trace step carries its **trigger** (the fact that routed it); execution is bounded (step budget
+ `max_iter`) and **replayable**.

## Detailed examples per control-flow construct

For each construct: a **concrete problem**, the **TypeScript code** that solves it, and the
**result**. (The imports from the first example apply to the rest. Predicate names stay in French to
match the engine's vocabulary.)

### 1. Sequence — chain steps (`puis`)

**Problem.** On signup: create the account, send the welcome email, then log — in that order. And be
able to **insert a step** (a free trial) without touching the code.

```ts
import { XNeuroneGrid, KnowledgeBase, FlowRunner, ToolRegistry } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry()
  .register({ name: 'db',    description: 'Writes to the DB',  run: async () => ({ text: 'account created' }) })
  .register({ name: 'email', description: 'Sends an email',    run: async (i) => ({ text: `email:${i['modele']}` }) })
  .register({ name: 'log',   description: 'Logs',              run: async (i) => ({ text: String(i['msg']) }) });

// the sequence, as facts
await kb.tell('inscription', 'entree', 'creer');
await kb.tell('creer', 'action', 'db');        await kb.tell('creer', 'puis', 'bienvenue');
await kb.tell('bienvenue', 'action', 'email'); await kb.tell('bienvenue', 'arg.modele', 'welcome');
await kb.tell('bienvenue', 'puis', 'journal');
await kb.tell('journal', 'action', 'log');     await kb.tell('journal', 'arg.msg', 'New signup');

await new FlowRunner(kb, tools).run('inscription');
// → db → email:welcome → log("New signup")

// INSERT "essai_gratuit" between creer and bienvenue, without touching the code:
kb.retract('creer', 'puis', 'bienvenue');          // unhook the old link
await kb.tell('creer', 'puis', 'essai_gratuit');
await kb.tell('essai_gratuit', 'action', 'db');    await kb.tell('essai_gratuit', 'puis', 'bienvenue');

await new FlowRunner(kb, tools).run('inscription');
// → db → db(trial) → email:welcome → log(...)   ← one step added by 3 facts
```

**Result.** The order lives in the `puis` facts; inserting or removing a step is a few
`tell` / `retract`, never a redeploy.

### 2. Condition — branch on a fact (`si` / `alors` / `sinon`)

**Problem.** Restrict the admin panel to admins (else a 403), and be able to **grant or revoke the
right hot**.

```ts
// (same imports as above)
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const ui = new ToolRegistry().register({
  name: 'afficher', description: 'Renders a view', run: async (i) => ({ text: `view:${i['vue']}` }),
});

await kb.tell('acces', 'entree', 'porte');
await kb.tell('porte', 'si', 'user role admin');
await kb.tell('porte', 'alors', 'admin'); await kb.tell('porte', 'sinon', 'refus');
await kb.tell('admin', 'action', 'afficher'); await kb.tell('admin', 'arg.vue', 'admin');
await kb.tell('refus', 'action', 'afficher'); await kb.tell('refus', 'arg.vue', '403');

await new FlowRunner(kb, ui).run('acces');   // → view:403   (not admin)
await kb.tell('user', 'role', 'admin');      // GRANT the right, hot
await new FlowRunner(kb, ui).run('acces');   // → view:admin
kb.retract('user', 'role', 'admin');         // REVOKE it
await new FlowRunner(kb, ui).run('acces');   // → view:403
```

**Result.** `si "user role admin"` reads the memory (0 tokens); access opens or closes by adding or
retracting a fact. Short form `si "user actif"` = true if `(user, actif)` has a value.

#### "Else-if" (`sinon si`) — chain conditions

**Problem.** Tiered discount: gold → 20%, else silver → 10%, else full price. No dedicated keyword:
the `sinon` **points to another condition**.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'remise', description: 'Applies a discount', run: async (i) => ({ text: `-${i['taux']}%` }),
});

await kb.tell('prix', 'entree', 'or');
await kb.tell('or', 'si', 'user niveau or');
await kb.tell('or', 'alors', 'r20'); await kb.tell('or', 'sinon', 'argent');     // sinon → ANOTHER condition
await kb.tell('argent', 'si', 'user niveau argent');
await kb.tell('argent', 'alors', 'r10'); await kb.tell('argent', 'sinon', 'plein');
await kb.tell('r20', 'action', 'remise');   await kb.tell('r20', 'arg.taux', '20');
await kb.tell('r10', 'action', 'remise');   await kb.tell('r10', 'arg.taux', '10');
await kb.tell('plein', 'action', 'remise'); await kb.tell('plein', 'arg.taux', '0');

await kb.tell('user', 'niveau', 'argent');
await new FlowRunner(kb, tools).run('prix');   // gold? no → silver? yes → -10%
```

**Result.** "if gold … else if silver … else full price" by plain chaining. Rule of thumb: a
`switch` when testing the **same value**; an else-if when the conditions **differ**.

### 3. Numeric condition — compare a value (`si "s p OP n"`)

**Problem.** Free shipping above €50; the **threshold** must change with no redeploy.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'frais', description: 'Applies a fee', run: async (i) => ({ text: `${i['montant']} €` }),
});

await kb.tell('checkout', 'entree', 'seuil');
await kb.tell('panier', 'total', '64');
await kb.tell('seuil', 'si', 'panier total >= 50');     // the threshold lives IN a fact
await kb.tell('seuil', 'alors', 'gratuit'); await kb.tell('seuil', 'sinon', 'payant');
await kb.tell('gratuit', 'action', 'frais'); await kb.tell('gratuit', 'arg.montant', '0');
await kb.tell('payant', 'action', 'frais');  await kb.tell('payant', 'arg.montant', '5.90');

await new FlowRunner(kb, tools).run('checkout');   // 64 >= 50 → 0 € (free)

// change the THRESHOLD with no redeploy: replace the condition fact
kb.retract('seuil', 'si', 'panier total >= 50');
await kb.tell('seuil', 'si', 'panier total >= 75');
await new FlowRunner(kb, tools).run('checkout');   // 64 >= 75 ? no → 5.90 € (paid)
```

**Result.** Operators `>` `>=` `<` `<=` `=` `!=`. The threshold is **data** → a manager tweaks it
hot. Other cases: `si "user age >= 18"`, `si "stock quantite < 5"`.

### 4. Switch — route on a value (`switch` / `cas.<v>` / `défaut`)

**Problem.** Route a ticket to the right queue by priority, and **add a category** without touching
the executor.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'affecter', description: 'Assigns to a team', run: async (i) => ({ text: `→ ${i['equipe']}` }),
});

await kb.tell('support', 'entree', 'triage');
await kb.tell('ticket', 'priorite', 'haute');
await kb.tell('triage', 'switch', 'ticket priorite');
await kb.tell('triage', 'cas.haute', 'urgent'); await kb.tell('triage', 'cas.basse', 'differe');
await kb.tell('triage', 'défaut', 'n1');
await kb.tell('urgent', 'action', 'affecter');  await kb.tell('urgent', 'arg.equipe', 'on-call');
await kb.tell('differe', 'action', 'affecter'); await kb.tell('differe', 'arg.equipe', 'backlog');
await kb.tell('n1', 'action', 'affecter');      await kb.tell('n1', 'arg.equipe', 'support_n1');

await new FlowRunner(kb, tools).run('support');   // priority=haute → on-call

// ADD a "critique" category, without touching the executor:
await kb.tell('triage', 'cas.critique', 'escalade');
await kb.tell('escalade', 'action', 'affecter'); await kb.tell('escalade', 'arg.equipe', 'leadership');
kb.retract('ticket', 'priorite', 'haute'); await kb.tell('ticket', 'priorite', 'critique');
await new FlowRunner(kb, tools).run('support');   // priority=critique → leadership
```

**Result.** The value selects `cas.<value>`; with no match → `défaut`. A new category = two facts,
no code.

### 5. Bounded loop — iterate over a collection (`pour_chaque` / `corps` / `max_iter`)

**Problem.** Send a campaign to a list, but **cap** it to prevent any over-send (anti-runaway).

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const sent: string[] = [];
const tools = new ToolRegistry().register({
  name: 'email', description: 'Sends an email',
  run: async (i) => { sent.push(String(i['a'])); return { text: `→ ${i['a']}` }; },
});

await kb.tell('campagne', 'entree', 'diffuser');
for (const d of ['alice', 'bob', 'carol']) { await kb.tell('liste', 'destinataire', d); }
await kb.tell('diffuser', 'pour_chaque', 'liste destinataire');
await kb.tell('diffuser', 'corps', 'envoyer');
await kb.tell('diffuser', 'max_iter', '2');          // CAP: 2 at most
await kb.tell('envoyer', 'action', 'email'); await kb.tell('envoyer', 'arg.a', '$item');

await new FlowRunner(kb, tools).run('campagne');
console.log(sent);   // ['alice', 'bob']  ← 2 of 3, never a runaway
```

**Result.** `pour_chaque` iterates over `(liste, destinataire)`, `$item` = the current element,
`max_iter` **bounds** it → guaranteed halt. Neighboring cases: re-engage abandoned carts, drain a queue.

### 6. Action — trigger a capability (`action` + `arg.*`)

**Problem.** When an order is paid, **notify the ERP** via webhook — without hard-coding that
integration point into the flow.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'http_post', description: 'HTTP POST',
  run: async (i) => {
    // await fetch(String(i['url']), { method: 'POST', body: String(i['corps']) });
    return { text: `POST ${i['url']}` };
  },
});

await kb.tell('commande_payee', 'entree', 'notifier');
await kb.tell('notifier', 'action', 'http_post');
await kb.tell('notifier', 'arg.url', 'https://erp.internal/orders');
await kb.tell('notifier', 'arg.corps', 'order #4187 paid');

await new FlowRunner(kb, tools).run('commande_payee');   // POST https://erp.internal/orders
```

**Result.** The `action` calls the declared **tool** (`http_post`, `email`, `db`…) and the `arg.*`
are its parameters. The tool = the real capability; the flow only **orchestrates** it.

### A full flow — checkout funnel

**Problem.** An end-to-end funnel: check stock (condition), route by payment (switch), reserve each
item (loop), confirm (action) — entirely fact-driven.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry()
  .register({ name: 'payer',       description: 'Captures payment',     run: async (i) => ({ text: `paid via ${i['fournisseur']}` }) })
  .register({ name: 'stock_moins', description: 'Decrements stock',     run: async (i) => ({ text: `-1 ${i['sku']}` }) })
  .register({ name: 'email',       description: 'Email',                run: async (i) => ({ text: `mail:${i['modele']}` }) });

// order data
await kb.tell('stock', 'disponible', 'oui');
await kb.tell('commande', 'moyen_paiement', 'carte');
await kb.tell('commande', 'article', 'sku-001'); await kb.tell('commande', 'article', 'sku-002');

// the flow
await kb.tell('cmd', 'entree', 'verif');
await kb.tell('verif', 'si', 'stock disponible oui');
await kb.tell('verif', 'alors', 'paiement'); await kb.tell('verif', 'sinon', 'rupture');
await kb.tell('paiement', 'switch', 'commande moyen_paiement');
await kb.tell('paiement', 'cas.carte', 'capture'); await kb.tell('paiement', 'défaut', 'capture');
await kb.tell('capture', 'action', 'payer'); await kb.tell('capture', 'arg.fournisseur', 'stripe');
await kb.tell('capture', 'puis', 'reserver');
await kb.tell('reserver', 'pour_chaque', 'commande article');
await kb.tell('reserver', 'corps', 'dec'); await kb.tell('reserver', 'max_iter', '200');
await kb.tell('reserver', 'puis', 'confirmer');
await kb.tell('dec', 'action', 'stock_moins'); await kb.tell('dec', 'arg.sku', '$item');
await kb.tell('confirmer', 'action', 'email'); await kb.tell('confirmer', 'arg.modele', 'confirmation');
await kb.tell('rupture', 'action', 'email');   await kb.tell('rupture', 'arg.modele', 'rupture_stock');

const trace = await new FlowRunner(kb, tools).run('cmd');
// stock yes → switch carte → payer(stripe) → dec sku-001, dec sku-002 → mail:confirmation
```

**Result.** The six constructs orchestrated by facts, in a single deterministic trace.

### Recap — which construct for which need

| Need | Construct | Predicates |
|------|-----------|------------|
| Chain steps | Sequence | `puis` |
| Decide on a present fact | Condition | `si "s p o"` · `alors` · `sinon` |
| Decide on a numeric threshold | Numeric condition | `si "s p >= n"` |
| Route among several cases | Switch | `switch` · `cas.<v>` · `défaut` |
| Repeat over a list (capped) | Bounded loop | `pour_chaque` · `corps` · `max_iter` |
| Act on the world | Action | `action` · `arg.<k>` |

## Testing safely: dev / prod

The memory is worked in **layers**: prod runs read-only, and a **dev overlay** receives new facts.
You test a behavior change there **without touching prod**, inspect the trace, then **promote** the
validated facts to prod — a tagged **release**, **reversible** in one gesture (retracted facts are
archived, never lost). See [Layers](layers).

```
dev : add/adjust facts → run → check the trace
   └ promote (release) → prod      ·      revert the release → back to the previous state
```

## Guarantees

- **Deterministic**: given the memory and tools, the same flow always yields the same trace.
- **Bounded**: global step budget + per-loop `max_iter` → **guaranteed halt**, even on a cycle.
- **Traced & explainable**: every step carries its trigger; no opaque decision.
- **0 tokens** for conditions: they are plain memory reads.

## When to use it

| Situation | Recommended mode |
|-----------|------------------|
| Properties, classes, attributes ("who is what") | classic symbolic deduction |
| "Why", "what led to", "in what order" | Plot Reasoning |
| Open-ended reasoning validated step by step | PingPong |
| **Hot-editable app behavior, tested in dev then promoted to prod** | **Dynamic behavior** |
