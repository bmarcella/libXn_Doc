# Proactive deduction

A reasoning mode that **speaks without a question**. The other engines answer when asked; this
one continuously sweeps the memory and **anticipates** — it proposes facts, and **alerts** the
user to what they haven't seen. Deterministic, at 0 tokens.

## Alerts

| Insight | What it detects | Example |
|---------|-----------------|---------|
| **contradiction** | two opposite facts coexist | "x likes tea" AND "x does not like tea" |
| **violated near-rule** | a strong regularity with ONE counterexample | "everyone living in France speaks French — except e. Missing data or exception?" |
| **missing data** | a class member lacking the attribute the others have | "Diana is the only employee without a salary" |
| **incoherent plot** | a cause proven to come after its effect | "the evacuation would cause the alarm, yet the alarm precedes the evacuation" |
| **stale facts** | freshness expired | "3 web facts older than 30 days to re-verify" |

## Anticipations

Around the subjects in focus (the current conversation):

- **similar subjects** — "titi resembles tweety (4 shared facts) — compare?";
- **little-known inherited facts** — "by the way: tweety has feathers (inherited from bird)".

## In practice

```ts
import { KnowledgeBase, XNeuroneGrid, InsightEngine } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

// A contradiction…
await kb.tell('x', 'likes', 'tea', { kind: 'user' });
await kb.tell('x', 'not_likes', 'tea', { kind: 'user' });
// …and missing data: every employee has a salary, except diana
for (const e of ['alice', 'bob', 'carol']) {
  await kb.tell(e, 'is', 'employee', { kind: 'user' });
  await kb.tell(e, 'salary', '3000', { kind: 'user' });
}
await kb.tell('diana', 'is', 'employee', { kind: 'user' });   // no salary

const insights = new InsightEngine(kb);

// Sweep the memory — alerts first, then anticipations around the focus (current conversation).
for (const i of insights.scan({ focus: ['x'] })) {
  console.log(`[${i.severity}] ${i.kind} — ${i.text}`);
}
// [warning] contradiction — "x likes tea" AND "x not_likes tea" coexist…
// [warning] gap — diana is the only "employee" without a "salary"
```

**Dedup across scans** — every insight carries a **stable key** (`i.key`): the host keeps what it
already surfaced and alerts **only once**.

```ts
const seen = new Set<string>();
function freshInsights() {
  const fresh = insights.scan().filter(i => !seen.has(i.key));
  fresh.forEach(i => seen.add(i.key));   // next scan won't re-report them
  return fresh;
}
```

`scan(opts)` options: `focus` (prioritized subjects), `alertsOnly: true` (drop the `info`
anticipations), `maxInsights` (cap, default 10).

## The contract

- Every insight carries a **stable key**: the host deduplicates — you are alerted **only once**.
- Alerts are **global** (the whole memory); focus only prioritizes.
- Everything is deterministic and traceable: an insight can be verified like any fact.

The memory becomes a **colleague**: it no longer just answers correctly — it notices what's
off, and says so.
