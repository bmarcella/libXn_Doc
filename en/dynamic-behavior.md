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
