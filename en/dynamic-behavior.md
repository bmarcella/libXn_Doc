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

For each construct: a **real use case**, the **facts** that define it (one triplet per line), and the
resulting **behavior**. (Reserved predicate names stay in French to match the engine's vocabulary.)

### 1. Sequence — chain steps (`puis`)

**Use case: user signup.** Three steps that chain.

```
inscription entree creer_compte
creer_compte action db_inserer
creer_compte arg.table "users"
creer_compte puis envoyer_bienvenue
envoyer_bienvenue action email
envoyer_bienvenue arg.modele "welcome"
envoyer_bienvenue puis journaliser
journaliser action log
journaliser arg.msg "New signup"
```

→ `db_inserer` then `email` then `log`. Inserting a step (e.g. `creer_essai_gratuit`) between two is
adding a `puis` fact — no code change.

### 2. Condition — branch on a fact (`si` / `alors` / `sinon`)

**Use case: access to a restricted feature.** "Is the user an admin?"

```
verif_acces entree porte
porte si "user role admin"
porte alors panneau_admin
porte sinon refus
panneau_admin action afficher
panneau_admin arg.vue "admin"
refus action afficher
refus arg.vue "403"
```

→ `si "user role admin"` is true if the memory contains the fact `user role admin`. Adding or
removing that fact opens or cuts access **hot**. Short form `si "user actif"` = true if `(user, actif)`
has at least one value.

**"Else-if" (`sinon si`) — chain conditions.** There is no dedicated keyword: a condition's `sinon`
**points to another condition**. You chain as many cases as needed.

**Use case: discount by loyalty tier** (gold → 20%, else silver → 10%, else full price).

```
prix entree niv_or
niv_or si "user niveau or"
niv_or alors remise_20
niv_or sinon niv_argent
niv_argent si "user niveau argent"
niv_argent alors remise_10
niv_argent sinon plein_tarif
remise_20 action appliquer
remise_20 arg.taux "20"
remise_10 action appliquer
remise_10 arg.taux "10"
plein_tarif action appliquer
plein_tarif arg.taux "0"
```

→ Reads as "if gold → 20%; **else if** silver → 10%; else → full price". The `sinon` of `niv_or`
leads to the `niv_argent` condition, and so on. Rule of thumb: use a **switch** when testing the
**same value** across cases; use a chained **else-if** when the conditions **differ** (distinct
thresholds, different subjects…).

### 3. Numeric condition — compare a value (`si "s p OP n"`)

**Use case: business rule — free shipping above a threshold.**

```
checkout entree seuil_livraison
panier total 64
seuil_livraison si "panier total >= 50"
seuil_livraison alors livraison_gratuite
seuil_livraison sinon livraison_payante
livraison_gratuite action appliquer_frais
livraison_gratuite arg.montant "0"
livraison_payante action appliquer_frais
livraison_payante arg.montant "5.90"
```

→ Operators: `>` `>=` `<` `<=` `=` `!=`. The threshold (`50`) lives in a fact: a manager changes it
with no redeploy. Other examples: `si "user age >= 18"`, `si "stock quantite < 5"`.

### 4. Switch — route on a value (`switch` / `cas.<v>` / `défaut`)

**Use case: triaging a support ticket by priority.**

```
support entree triage
ticket priorite haute
triage switch "ticket priorite"
triage cas.haute file_urgente
triage cas.moyenne file_standard
triage cas.basse file_differee
triage défaut file_standard
file_urgente action affecter
file_urgente arg.equipe "astreinte"
file_standard action affecter
file_standard arg.equipe "support_n1"
file_differee action affecter
file_differee arg.equipe "backlog"
```

→ The value of `(ticket, priorite)` selects branch `cas.<value>`; with no match, it falls back to
`défaut`. Adding a category = adding a `cas.critique …` fact, without touching the executor.

### 5. Bounded loop — iterate over a collection (`pour_chaque` / `corps` / `max_iter`)

**Use case: send a campaign, capped to prevent any runaway.**

```
campagne entree diffuser
liste destinataire alice
liste destinataire bob
liste destinataire carol
diffuser pour_chaque "liste destinataire"
diffuser corps envoyer
diffuser max_iter 100
diffuser puis bilan
envoyer action email
envoyer arg.a "$item"
envoyer arg.modele "promo"
bilan action log
bilan arg.msg "Campaign done"
```

→ `pour_chaque "liste destinataire"` iterates over the objects of `(liste, destinataire)`. In the
body, `$item` is replaced by the current recipient (`alice`, then `bob`, then `carol`). `max_iter 100`
**bounds** the loop → guaranteed halt, no runaway. Neighboring cases: re-engage abandoned carts,
process a task queue.

### 6. Action — trigger a capability (`action` + `arg.*`)

**Use case: notify an external system (webhook).**

```
commande_payee entree notifier_erp
notifier_erp action http_post
notifier_erp arg.url "https://erp.internal/orders"
notifier_erp arg.corps "order #4187 paid"
```

→ The `action` calls a **declared tool** (`http_post`, `email`, `db_inserer`, `calcul`…) and the
`arg.*` are its parameters. A tool = a real capability wired by the team; the flow only **orchestrates** them.

### A full flow — checkout funnel

Constructs combined: check stock (condition), route by payment (switch), reserve each item (loop),
confirm (action).

```
commande entree verif_stock
stock disponible oui
commande moyen_paiement carte
commande article sku-001
commande article sku-002
verif_stock si "stock disponible oui"
verif_stock alors paiement
verif_stock sinon rupture
paiement switch "commande moyen_paiement"
paiement cas.carte capture_carte
paiement cas.paypal capture_paypal
paiement défaut capture_carte
capture_carte action payer
capture_carte arg.fournisseur "stripe"
capture_carte puis reserver_articles
capture_paypal action payer
capture_paypal arg.fournisseur "paypal"
capture_paypal puis reserver_articles
reserver_articles pour_chaque "commande article"
reserver_articles corps decrementer
reserver_articles max_iter 200
reserver_articles puis confirmer
decrementer action stock_moins
decrementer arg.sku "$item"
confirmer action email
confirmer arg.modele "confirmation"
rupture action email
rupture arg.modele "rupture_stock"
```

→ Trace: stock available → `paiement` → method = carte → `capture_carte` (pay via stripe) →
`reserver_articles` decrements `sku-001` then `sku-002` → `confirmer` (confirmation email).

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
archived, never lost).

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
