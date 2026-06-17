# Proactive deduction

A reasoning mode that **speaks without a question**. The other engines answer when asked; this
one continuously sweeps the memory and **anticipates** — it proposes facts, and **alerts** the
user to what they haven't seen. Deterministic, at 0 tokens.

## Alerts

| Insight | What it detects | Example |
|---------|-----------------|---------|
| **contradiction** | the **same object** is both asserted AND denied for a subject (`p` and `not_p` on the **same** value). Different objects are not a contradiction ("can use" + "cannot proceed" is consistent) | "x likes tea" AND "x does not like tea" |
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

Breakdown of the functions used above.

**`new XNeuroneGrid(encoder?, opts?)`** — the in-memory QPath graph (the "engine" beneath the KB).

- `encoder?` — the input → bitstream encoder. **Optional**: `undefined` (the placeholder in every example) uses the core's **default** encoder. Only pass one for custom encoding.
- `opts?` — an object `{ headless?: boolean }`. **Defaults to `{}`** (= with rendering). `headless: true` disables Three.js rendering: required on **Node/server** (no DOM) and for tests.

**`new KnowledgeBase(grid)`** — the `(subject, predicate, object)` fact layer sitting on the grid.

- `grid` — the `XNeuroneGrid` used as working memory. **Only argument**, required. If the grid is pre-filled (a reloaded snapshot), the constructor **rebuilds its indices** on the way in.

**`kb.tell(s, p, o, source?, flags?)`** — records a fact. Asynchronous.

| Argument | Role | Default |
|---|---|---|
| `s` | the **subject** (e.g. `'x'`, `'diana'`) | — (required) |
| `p` | the **predicate** (e.g. `'likes'`, `'salary'`); a `not_<p>` expresses the **negation** of the same predicate | — (required) |
| `o` | the **object** / value (e.g. `'tea'`, `'3000'`) | — (required) |
| `source?` | the fact's **provenance** — an object `{ kind, ref? }`. `kind` is `'user'` (input/chat), `'document'`, `'web'`, `'tool'`, `'llm-verified'`, `'inference'` or `'import'`; `ref?` is a URL / document id / tool name | — (no provenance) |
| `flags?` | atomic flags written in the **same** operation (e.g. `{ secret: true }`, `closed`, `major`) | — (no flags) |

> 💡 **`{ kind: 'user' }` is not mandatory** — it's the `source` (optional). We set it here to mark these facts as coming from the user, which makes insights richer ("contested decision", freshness…). Without it, `tell` works just the same.
>
> **Return shape**: `tell` returns a `Promise<ContradictionReport | null>` — `null` when all is well, a **contradiction report** if the exact opposite (`p` ↔ `not_p`) already existed. (`InsightEngine` also detects these contradictions *after the fact* via `scan`, so ignoring this return value stays safe.)

**`new InsightEngine(kb)`** — the proactive-deduction engine.

- `kb` — the `KnowledgeBase` to watch. **Only argument**, required. The engine stores nothing of its own: it **reads** the KB on every `scan` (deterministic, 0 tokens).

**`insights.scan(opts?)`** — sweeps the memory and returns insights.

| Option (`opts`) | Role | Default |
|---|---|---|
| `focus?` | prioritized subjects (the current conversation) — **enables** targeted anticipations and **prioritizes** those subjects in the ordering | `[]` (no focus → no anticipations) |
| `maxInsights?` | cap on the number of insights returned (alerts first) | `10` |
| `alertsOnly?` | `true` drops the `info` anticipations (keeps only `warning` alerts) | `false` |

> **Return shape**: an `Insight[]` **array**, sorted (`warning` alerts first, then anticipations touching the focus, then the rest, truncated to `maxInsights`). Each `Insight` carries: `kind` (`'contradiction'` \| `'plot-incoherence'` \| `'anomaly'` \| `'gap'` \| `'stale'` \| `'suggestion'`), `severity` (`'warning'` \| `'info'`), `text` (a chat-ready human sentence), `about` (the subjects concerned) and `key` (a stable dedup key — see below). Calling it bare, `scan()`, is equivalent to `scan({})`.

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
