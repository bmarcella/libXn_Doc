# Dynamic behavior

A mode where **the application's behavior lives in facts**, not in frozen code. The control flow —
conditions, switches, loops, actions — is stored as ordinary facts, and an executor walks them.
**Adding a fact = changing behavior, with no redeploy.**

Flow keywords are in **English** (universal): `entry`, `if` / `then` / `else`,
`switch` / `case.` / `default`, `for_each` / `body` / `max_iter`, `action` / `arg.` / `next`.

```
welcome entry check
check if "user est premium"
check then message_premium
check else message_basic
message_premium action notify
message_premium arg.text "Welcome, premium member."
```

The same flow produces two behaviors from **a single fact**: adding `user est premium` routes to
the premium branch. All of it **deterministic, traced, at 0 tokens**.

## What it can do

| Construct | Role | Example |
|-----------|------|---------|
| **Condition** | branch on a fact | `if "user est premium"` → `then` / `else` |
| **Numeric condition** | compare a value | `if "user age >= 18"` |
| **Switch** | route on a value | `switch "user plan"` → `case.gold` / `default` |
| **Bounded loop** | iterate over a collection | `for_each "panier article"`, `max_iter 50` |
| **Action** | trigger a capability | `action notify` + arguments |

Every run returns its **full trace** — which step, triggered by which fact — like everything else
in the memory: auditable.

## Conventions

Everything is an ordinary triplet; only the **predicates** are conventional:

- `entry` — a flow's entry point;
- `if` / `then` / `else` — the condition (evaluated by a **memory read**, hence 0 tokens);
- `switch` / `case.<value>` / `default` — the switch;
- `for_each` / `body` / `max_iter` — the loop (always **bounded**);
- `action` / `arg.<key>` / `next` — the action and what comes next.

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
await prod.tell('accueil', 'entry', 'verif');
await prod.tell('verif', 'if', 'user est premium');
await prod.tell('verif', 'then', 'msg_premium');
await prod.tell('verif', 'else', 'msg_basique');
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
**result**. (The imports from the first example apply to the rest.)

### 1. Sequence — chain steps (`next`)

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
await kb.tell('inscription', 'entry', 'creer');
await kb.tell('creer', 'action', 'db');        await kb.tell('creer', 'next', 'bienvenue');
await kb.tell('bienvenue', 'action', 'email'); await kb.tell('bienvenue', 'arg.modele', 'welcome');
await kb.tell('bienvenue', 'next', 'journal');
await kb.tell('journal', 'action', 'log');     await kb.tell('journal', 'arg.msg', 'New signup');

await new FlowRunner(kb, tools).run('inscription');
// → db → email:welcome → log("New signup")

// INSERT "essai_gratuit" between creer and bienvenue, without touching the code:
kb.retract('creer', 'next', 'bienvenue');          // unhook the old link
await kb.tell('creer', 'next', 'essai_gratuit');
await kb.tell('essai_gratuit', 'action', 'db');    await kb.tell('essai_gratuit', 'next', 'bienvenue');

await new FlowRunner(kb, tools).run('inscription');
// → db → db(trial) → email:welcome → log(...)   ← one step added by 3 facts
```

**Result.** The order lives in the `next` facts; inserting or removing a step is a few
`tell` / `retract`, never a redeploy.

### 2. Condition — branch on a fact (`if` / `then` / `else`)

**Problem.** Restrict the admin panel to admins (else a 403), and be able to **grant or revoke the
right hot**.

```ts
// (same imports as above)
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const ui = new ToolRegistry().register({
  name: 'afficher', description: 'Renders a view', run: async (i) => ({ text: `view:${i['vue']}` }),
});

await kb.tell('acces', 'entry', 'porte');
await kb.tell('porte', 'if', 'user role admin');
await kb.tell('porte', 'then', 'admin'); await kb.tell('porte', 'else', 'refus');
await kb.tell('admin', 'action', 'afficher'); await kb.tell('admin', 'arg.vue', 'admin');
await kb.tell('refus', 'action', 'afficher'); await kb.tell('refus', 'arg.vue', '403');

await new FlowRunner(kb, ui).run('acces');   // → view:403   (not admin)
await kb.tell('user', 'role', 'admin');      // GRANT the right, hot
await new FlowRunner(kb, ui).run('acces');   // → view:admin
kb.retract('user', 'role', 'admin');         // REVOKE it
await new FlowRunner(kb, ui).run('acces');   // → view:403
```

**Result.** `if "user role admin"` reads the memory (0 tokens); access opens or closes by adding or
retracting a fact. Short form `if "user actif"` = true if `(user, actif)` has a value.

#### "else-if" variant — chain conditions

**Problem.** Tiered discount: gold → 20%, else silver → 10%, else full price. No dedicated keyword:
the `else` **points to another condition**.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'remise', description: 'Applies a discount', run: async (i) => ({ text: `-${i['taux']}%` }),
});

await kb.tell('prix', 'entry', 'or');
await kb.tell('or', 'if', 'user niveau or');
await kb.tell('or', 'then', 'r20'); await kb.tell('or', 'else', 'argent');     // else → ANOTHER condition
await kb.tell('argent', 'if', 'user niveau argent');
await kb.tell('argent', 'then', 'r10'); await kb.tell('argent', 'else', 'plein');
await kb.tell('r20', 'action', 'remise');   await kb.tell('r20', 'arg.taux', '20');
await kb.tell('r10', 'action', 'remise');   await kb.tell('r10', 'arg.taux', '10');
await kb.tell('plein', 'action', 'remise'); await kb.tell('plein', 'arg.taux', '0');

await kb.tell('user', 'niveau', 'argent');
await new FlowRunner(kb, tools).run('prix');   // gold? no → silver? yes → -10%
```

**Result.** "if gold … else-if silver … else full price" by plain chaining. Rule of thumb: a
`switch` when testing the **same value**; an else-if when the conditions **differ**.

### 3. Numeric condition — compare a value (`if "s p OP n"`)

**Problem.** Free shipping above €50; the **threshold** must change with no redeploy.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'frais', description: 'Applies a fee', run: async (i) => ({ text: `${i['montant']} €` }),
});

await kb.tell('checkout', 'entry', 'seuil');
await kb.tell('panier', 'total', '64');
await kb.tell('seuil', 'if', 'panier total >= 50');     // the threshold lives IN a fact
await kb.tell('seuil', 'then', 'gratuit'); await kb.tell('seuil', 'else', 'payant');
await kb.tell('gratuit', 'action', 'frais'); await kb.tell('gratuit', 'arg.montant', '0');
await kb.tell('payant', 'action', 'frais');  await kb.tell('payant', 'arg.montant', '5.90');

await new FlowRunner(kb, tools).run('checkout');   // 64 >= 50 → 0 € (free)

// change the THRESHOLD with no redeploy: replace the condition fact
kb.retract('seuil', 'if', 'panier total >= 50');
await kb.tell('seuil', 'if', 'panier total >= 75');
await new FlowRunner(kb, tools).run('checkout');   // 64 >= 75 ? no → 5.90 € (paid)
```

**Result.** Operators `>` `>=` `<` `<=` `=` `!=`. The threshold is **data** → a manager tweaks it
hot. Other cases: `if "user age >= 18"`, `if "stock quantite < 5"`.

### 4. Switch — route on a value (`switch` / `case.<v>` / `default`)

**Problem.** Route a ticket to the right queue by priority, and **add a category** without touching
the executor.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'affecter', description: 'Assigns to a team', run: async (i) => ({ text: `→ ${i['equipe']}` }),
});

await kb.tell('support', 'entry', 'triage');
await kb.tell('ticket', 'priorite', 'haute');
await kb.tell('triage', 'switch', 'ticket priorite');
await kb.tell('triage', 'case.haute', 'urgent'); await kb.tell('triage', 'case.basse', 'differe');
await kb.tell('triage', 'default', 'n1');
await kb.tell('urgent', 'action', 'affecter');  await kb.tell('urgent', 'arg.equipe', 'on-call');
await kb.tell('differe', 'action', 'affecter'); await kb.tell('differe', 'arg.equipe', 'backlog');
await kb.tell('n1', 'action', 'affecter');      await kb.tell('n1', 'arg.equipe', 'support_n1');

await new FlowRunner(kb, tools).run('support');   // priority=haute → on-call

// ADD a "critique" category, without touching the executor:
await kb.tell('triage', 'case.critique', 'escalade');
await kb.tell('escalade', 'action', 'affecter'); await kb.tell('escalade', 'arg.equipe', 'leadership');
kb.retract('ticket', 'priorite', 'haute'); await kb.tell('ticket', 'priorite', 'critique');
await new FlowRunner(kb, tools).run('support');   // priority=critique → leadership
```

**Result.** The value selects `case.<value>`; with no match → `default`. A new category = two facts,
no code.

### 5. Bounded loop — iterate over a collection (`for_each` / `body` / `max_iter`)

**Problem.** Send a campaign to a list, but **cap** it to prevent any over-send (anti-runaway).

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const sent: string[] = [];
const tools = new ToolRegistry().register({
  name: 'email', description: 'Sends an email',
  run: async (i) => { sent.push(String(i['a'])); return { text: `→ ${i['a']}` }; },
});

await kb.tell('campagne', 'entry', 'diffuser');
for (const d of ['alice', 'bob', 'carol']) { await kb.tell('liste', 'destinataire', d); }
await kb.tell('diffuser', 'for_each', 'liste destinataire');
await kb.tell('diffuser', 'body', 'envoyer');
await kb.tell('diffuser', 'max_iter', '2');          // CAP: 2 at most
await kb.tell('envoyer', 'action', 'email'); await kb.tell('envoyer', 'arg.a', '$item');

await new FlowRunner(kb, tools).run('campagne');
console.log(sent);   // ['alice', 'bob']  ← 2 of 3, never a runaway
```

**Result.** `for_each` iterates over `(liste, destinataire)`, `$item` = the current element,
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

await kb.tell('commande_payee', 'entry', 'notifier');
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
await kb.tell('cmd', 'entry', 'verif');
await kb.tell('verif', 'if', 'stock disponible oui');
await kb.tell('verif', 'then', 'paiement'); await kb.tell('verif', 'else', 'rupture');
await kb.tell('paiement', 'switch', 'commande moyen_paiement');
await kb.tell('paiement', 'case.carte', 'capture'); await kb.tell('paiement', 'default', 'capture');
await kb.tell('capture', 'action', 'payer'); await kb.tell('capture', 'arg.fournisseur', 'stripe');
await kb.tell('capture', 'next', 'reserver');
await kb.tell('reserver', 'for_each', 'commande article');
await kb.tell('reserver', 'body', 'dec'); await kb.tell('reserver', 'max_iter', '200');
await kb.tell('reserver', 'next', 'confirmer');
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
| Chain steps | Sequence | `next` |
| Decide on a present fact | Condition | `if "s p o"` · `then` · `else` |
| Decide on a numeric threshold | Numeric condition | `if "s p >= n"` |
| Route among several cases | Switch | `switch` · `case.<v>` · `default` |
| Repeat over a list (capped) | Bounded loop | `for_each` · `body` · `max_iter` |
| Act on the world | Action | `action` · `arg.<k>` |

## Keyword reference

Each keyword is a **reserved predicate**. A node (the triple's subject) carries one or more of them
to describe a flow step.

| Keyword | Carried by | What it does | How to use it |
|---------|-----------|--------------|---------------|
| `entry` | the **flow** | designates the start step | `(myFlow, entry, step0)` |
| `if` | a step | declares a **condition** read from memory (0 tokens) | `(e, if, "subject predicate object")` or `"s p OP n"` |
| `then` | an `if` step | next step if the condition is **true** | `(e, then, stepA)` |
| `else` | an `if` step | next step if **false**; may point to **another condition** (= else-if) | `(e, else, stepB)` |
| `switch` | a step | **routes** on a fact's value | `(e, switch, "subject predicate")` |
| `case.<v>` | a `switch` step | branch chosen when the value equals `<v>` | `(e, case.gold, stepG)` |
| `default` | a `switch` step | branch if no `case.` matches | `(e, default, stepD)` |
| `for_each` | a step | **iterates** over the objects of a fact | `(e, for_each, "subject predicate")` |
| `body` | a `for_each` step | the step run for each element (`$item`) | `(e, body, step)` |
| `max_iter` | a `for_each` step | iteration **cap** — guarantees halting | `(e, max_iter, "100")` |
| `action` | a step | runs a declared **tool** (the only side-effecting brick) | `(e, action, toolName)` |
| `arg.<key>` | an `action` step | a **parameter** passed to the tool (`$item` substituted in a loop) | `(e, arg.msg, "Hello")` |
| `next` | a step (action / loop) | the next step in **sequence** | `(e, next, nextStep)` |

**Node evaluation order**: `if` → `switch` → `for_each` → `action` → `next`. A node is of a **single
type** (condition, switch, loop, or action); you don't mix `if` and `switch` on the same node. Objects
are normalized (lowercase); the display case of `arg.*` is preserved.

### Why facts, and not an `ifFact().else()` builder?

The flow **is** facts — deliberately, and that's what gives it its value:

- **stored and queryable** like everything else in the memory;
- **layered** (dev/prod), **promotable** and **reversible** (release / rollback);
- **persistent** and **hot-editable** (add / retract a fact);
- **traceable** (each step carries the fact that triggered it).

A per-construct facade (`ifFact()`, `switchFact()`…) would reintroduce **classes** where the design
states that "fact types" are **not classes** but triple conventions; and if the facade became the
executed representation, you'd **lose** all those properties (a second execution path would diverge
from the facts). A fluent **builder** is still welcome — but only as **sugar that emits facts**, never
as a parallel runtime. Several authoring surfaces (raw triples, builder, natural language, visual
editor) converge on **a single source of truth: the facts**.

## Testing safely: dev / prod

The memory is worked in **layers**: prod runs read-only, and a **dev overlay** receives new facts.
You test a behavior change there **without touching prod**, inspect the trace, then **promote** the
validated facts to prod — a tagged **release**, **reversible** in one gesture (retracted facts are
archived, never lost). See [Layers](layers).

```
dev : add/adjust facts → run → check the trace
   └ promote (release) → prod      ·      revert the release → back to the previous state
```

> **A flow can be managed as a unit.** You can promote or revert **a single flow** (`promoteFlow`) or
> delete a whole one (`deleteFlow`) — not just the entire overlay: a flow's facts are grouped as
> companions of `flow:<name>`.

## Evolving the app by a prompt — safely

Since the flow is **facts**, it can be **written by an LLM** from a natural-language request — as long
as the LLM stays an **author**, never an executor, and the result is **validated** before prod.

```ts
import { FlowAuthor, promoteFlowIfValid, formatFlowIssues } from '@damba/libxn';

const ALLOWED = ['log', 'email'];   // what the LLM is allowed to invoke (tool allowlist)

// 1) The LLM PROPOSES facts (port LlmPort: Claude via backend, or a mock in tests).
const author = new FlowAuthor(myLLM);
const p = await author.propose(
  'when a customer becomes premium, send them a welcome email',
  { prod, tools, allowedTools: ALLOWED },
);

// 2) VALIDATION already decided (well-formed? bounded? tools allowed? dangling links?).
if (!p.validation.ok) {
  console.error(formatFlowIssues(p.validation));   // refused — prod is NOT touched
} else {
  // 3) GATE: promote only if valid (tagged release, reversible).
  await promoteFlowIfValid(p.dev, prod, p.flow!, 'v2', { tools, allowedTools: ALLOWED });
}
```

Two invariants make this safe:

- **The LLM is an author, not an executor.** It produces facts; `FlowRunner` executes, deterministically
  and traced. The LLM's nondeterminism is **confined to authoring**, which is validated.
- **The LLM is confined to the flow.** Any fact whose predicate is **not** part of the flow vocabulary
  (`entry`, `if`/`then`/`else`, `switch`/`case`/`default`, `for_each`/`body`/`max_iter`,
  `action`/`arg`/`next`) is **rejected up front**: it never enters the environment, hence **cannot be
  promoted to production**. The LLM cannot slip in arbitrary facts (identity, class, data…) under the
  guise of writing a flow.
- **No unsafe fact reaches prod.** `validateFlow` rejects an **unbounded** loop, a **dangling link**, an
  incomplete condition, or a **forbidden tool** (per-environment allowlist); the **gate** promotes only
  if everything is green; `rollbackRelease` reverts a release.

> Acknowledged boundary: the LLM **recombines** existing tools; it does not invent a new capability
> (that needs a registered tool). The app **reconfigures** itself through facts — it does not program
> itself from scratch.

## Two kinds of facts: structure and data

In an app's KB, two families of facts coexist:

- **Structure facts** (the "code"): `entry`, `if`, `then`, `action`, `arg.`… — the **shape** of the
  flow. You change them via **authoring → validation → promotion** (rarely, gated).
- **Data facts** (the state): `(user, role, admin)`, `(panier, total, 64)`, `(app, mode, maintenance)`…
  — they change **along the way**, written by an **action** (a tool can return facts), by another flow,
  or by the user. Conditions **read** them at execution time.

→ A **stable structural** flow reads a **dynamic state**: adding or removing a **data** fact reconfigures
behavior **without touching the flow**.

**Insertion order** only matters in two precise places (elsewhere, content-addressing makes it
irrelevant):

1. **A control predicate must carry exactly ONE value.** `FlowRunner` takes the **first** (`ask(s,p)[0]`).
   To **change** a branch (`then`, `next`, `entry`…), you must `retract` the old fact **then** `tell` the
   new one — a plain `tell` adds a 2nd value, and the **first inserted wins**.
2. **A loop's order** = the collection's insertion order: `for_each "panier article"` iterates items in
   the order they were added.

## Example: an Express app that reconfigures hot

The Express skeleton is deployed **once**. Route behavior lives in **facts**; you change it by
adding/modifying facts — **without restarting or redeploying**.

```ts
import express from 'express';
import {
  XNeuroneGrid, KnowledgeBase, LayeredKnowledgeBase,
  FlowRunner, ToolRegistry, promoteFlowIfValid,
} from '@damba/libxn';

// ── 1. The SKELETON — deployed once ───────────────────────────────────────
const prod = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const ALLOWED = ['json', 'status'];   // tools the reconfiguration may invoke

// Tools bound to THE current request's response (one registry per request → concurrency-safe).
function toolsFor(res: express.Response) {
  return new ToolRegistry()
    .register({ name: 'json',   description: 'Replies JSON', run: async (i) => { res.json(JSON.parse(String(i['body'] ?? '{}'))); return { text: 'ok' }; } })
    .register({ name: 'status', description: 'HTTP code',    run: async (i) => { res.status(Number(i['code'])); return { text: '' }; } });
}

// INITIAL behavior of GET /home — set as FACTS, not as Express code:
await prod.tell('GET /home', 'entry', 'gate');
await prod.tell('gate', 'if', 'app mode maintenance');           // condition = a DATA fact
await prod.tell('gate', 'then', 'maint'); await prod.tell('gate', 'else', 'welcome');
await prod.tell('maint', 'action', 'status'); await prod.tell('maint', 'arg.code', '503'); await prod.tell('maint', 'next', 'maintMsg');
await prod.tell('maintMsg', 'action', 'json'); await prod.tell('maintMsg', 'arg.body', '{"error":"maintenance"}');
await prod.tell('welcome', 'action', 'json'); await prod.tell('welcome', 'arg.body', '{"message":"Welcome"}');

const app = express();
app.use(express.json());

// ── 2. ONE generic route: it RUNS the flow named after the request ────────
app.all('*', async (req, res) => {
  const flow = `${req.method} ${req.path}`;                       // e.g. "GET /home"
  if (prod.ask(flow, 'entry').length === 0) { res.status(404).json({ error: 'unknown route' }); return; }
  await new FlowRunner(prod, toolsFor(res)).run(flow);           // behavior comes from FACTS
});

// ── 3a. Flip a DATA fact (no structure changed) ───────────────────────────
app.post('/admin/maintenance/:on', async (req, res) => {
  if (req.params.on === 'true') { await prod.tell('app', 'mode', 'maintenance'); }
  else { prod.retract('app', 'mode', 'maintenance'); }
  res.json({ ok: true });   // next GET /home changes behavior, with no redeploy
});

// ── 3b. Add / change STRUCTURE, validated then promoted ───────────────────
app.post('/admin/facts', async (req, res) => {
  const facts: [string, string, string][] = req.body.facts;      // (or a prompt → FlowAuthor)
  const overlay = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
  const dev = new LayeredKnowledgeBase(overlay, [prod]);
  for (const [s, p, o] of facts) { await dev.tell(s, p, o, { kind: 'user' }); }
  const flow = facts.find(([, p]) => p === 'entry')?.[0] ?? req.body.flow;
  const r = await promoteFlowIfValid(dev, prod, flow, `rel-${Date.now()}`, { tools: toolsFor(res), allowedTools: ALLOWED });
  res.json({ promoted: r.promoted, errors: r.validation.errors });  // refused if invalid → prod intact
});

app.listen(3000);
```

**Hot reconfiguration, no redeploy**:

| Action | Immediate effect | Concept |
|--------|------------------|---------|
| `GET /home` | `{"message":"Welcome"}` (`else` branch) | execution from facts |
| `POST /admin/maintenance/true` | next `GET /home` → `503 {"error":"maintenance"}` | **data fact** added along the way |
| `POST /admin/facts` (facts of a new route `GET /ping`) | `GET /ping` answers at once | **structure** added, validated + promoted |
| Re-point an existing branch | `retract` the old `then`/`next` **then** `tell` the new one | order/`retract` |

Express **never restarted**. The app's source code did **not change**: only its **behavior, in facts**,
evolved — under validation and the gate.

## Guarantees

- **Deterministic**: given the memory and tools, the same flow always yields the same trace.
- **Bounded**: global step budget + per-loop `max_iter` → **guaranteed halt**, even on a cycle.
  A malformed condition or loop expression, or a non-numeric cap, does **not crash** the executor:
  it falls back to a safe bound and the halt stays guaranteed.
- **Traced & explainable**: every step carries its trigger; no opaque decision.
- **0 tokens** for conditions: they are plain memory reads.

## When to use it

| Situation | Recommended mode |
|-----------|------------------|
| Properties, classes, attributes ("who is what") | classic symbolic deduction |
| "Why", "what led to", "in what order" | Plot Reasoning |
| Open-ended reasoning validated step by step | PingPong |
| **Hot-editable app behavior, tested in dev then promoted to prod** | **Dynamic behavior** |
