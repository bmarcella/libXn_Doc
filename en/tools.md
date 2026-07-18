# Tools

**Tools** extend QPath beyond its memory: a developer writes a capability (web search, calculation, API,
SQL query…) that **QPath can call to fill a gap**. It's the equivalent of LLM "function-calling", **but
grounded on QPath**: whatever the tool brings back becomes **memorized, auditable facts reusable at zero
token**.

> **QPath doesn't know → it calls a tool → the tool returns facts → QPath memorizes them.**

## Writing a tool

A tool is an object implementing the `Tool` port: a name, a description, and a `run`. It returns
**facts** (triplets) and/or a direct **value**.

```ts
import { Tool, ToolResult } from '@damba/libxn';

const weather: Tool = {
  name: 'weather',
  description: 'Current weather for a city',
  resolves: ['weather_of'],                  // (optional) predicate it can resolve
  async run(input): Promise<ToolResult> {
    const city = String(input['subject'] ?? input['query']);
    const data = await fetchWeather(city);
    return {
      facts: [[city, 'weather_of', data.condition]], // → memorized in QPath
      value: data,                                    // → optional direct answer
    };
  },
};
```

**The fields of the `Tool` object** (the port you implement):

| Field | Role | Default |
|---|---|---|
| `name` | unique tool identifier (used for the LLM-driven call, `TOOL <name>`) | — (required) |
| `description` | short description — used for selection (by the LLM or in docs) | — (required) |
| `resolves?` | list of predicates the tool can resolve → **deterministic binding** (called on a `(s, p)` cache-miss) | `undefined` (never triggered deterministically) |
| `ephemeral?` | if `true`, **no** fact from this tool is ever memorized (dynamic data by nature) | `false` |
| `run` | the function that executes the tool; see below | — (required) |

`run(input)` receives **a single argument**: `input: Record<string, unknown>` — a **free-form** bag of
keys/values. In deterministic mode the core fills it with `{ subject, predicate }`; LLM-driven, these
are the `args` of the `TOOL` move. Hence the `input['subject'] ?? input['query']`: you read the key your
tool expects, with a fallback. `run` returns a **`Promise<ToolResult>`**.

**The fields of the `ToolResult` object** (what `run` returns) — **all optional**:

| Field | Role | Default |
|---|---|---|
| `facts?` | `[subject, predicate, object]` triplets → **memorized** in the KB (unless volatile) | `undefined` (nothing to memorize) |
| `value?` | direct answer (computation, data object, status…), **not** memorized | `undefined` |
| `text?` | optional human-readable text, for the reasoning trace | `undefined` |
| `ephemeral?` | marks **this specific result** as volatile (overrides `Tool.ephemeral`) | inherits `Tool.ephemeral`, else `false` |

Tools are kept in a **registry**:

```ts
import { ToolRegistry } from '@damba/libxn';
const tools = new ToolRegistry().register(weather);
```

`new ToolRegistry()` takes **no argument**. `register(tool)` takes **one** tool and **returns the
registry itself** (`this`) — hence the chaining `new ToolRegistry().register(a).register(b)`. Under the
hood it indexes the tool by `name` (explicit call) and by each predicate in `resolves` (deterministic
binding). The registry's other methods: `get(name)` → `Tool | undefined`,
`byPredicate(p)` → `Tool | undefined`, `list()` → `Tool[]`.

> Under the hood, `ingestToolResult(kb, result, opts?)` (exported) is what writes a `ToolResult`'s
> facts into the KB **with their provenance**; both triggers below use it (`resolveWithTools` and
> PingPong's `TOOL` move).

`ingestToolResult` takes **three** arguments — `ingestToolResult(kb, result, opts?)`:

| Argument | Role | Default |
|---|---|---|
| `kb` | the `KnowledgeBase` to write the facts into | — (required) |
| `result` | the `ToolResult` whose `facts` field is ingested | — (required) |
| `opts?` | write options `{ ephemeral?, source? }` — see below | `{}` |

The `opts` fields: `ephemeral?` (if `true`, **nothing** is written → returns `[]`) and `source?`
(the **provenance** attached to each fact, typically `{ kind: 'tool', ref: tool.name }` — it is what
later lets the same tool be re-called to re-verify). The function **returns** the list of facts actually
written: `Array<{ s: string; p: string; o: string }>` (empty if volatile).

## Two ways to trigger a tool

### 1. Deterministic (predicate binding) — no LLM

If a tool declares `resolves: ['weather_of']`, QPath calls it automatically when it doesn't know
`(s, weather_of)`:

```ts
import { resolveWithTools } from '@damba/libxn';

const r = await resolveWithTools(kb, tools, 'paris', 'weather_of');
// QPath didn't know → the tool runs → the fact is memorized → r.objects = ['rain']
// Next time, QPath answers on its own: zero token, zero tool call.
```

`resolveWithTools` takes **four** arguments — `resolveWithTools(kb, registry, s, p)`:

| Argument | Role | Default |
|---|---|---|
| `kb` | the `KnowledgeBase` being queried (and where the fact gets memorized) | — (required) |
| `registry` | the `ToolRegistry` to look up the tool bound to the predicate | — (required) |
| `s` | the **subject** of the question `(s, p)` | — (required) |
| `p` | the **predicate**; if QPath doesn't know it and a tool declares `resolves: [p]`, the tool is called | — (required) |

The function **returns** a `ResolveWithToolsResult`:

| Field | Meaning |
|---|---|
| `objects` | the objects of `(s, p)` after the possible tool call (re-read from the KB → consistent with what is actually queryable) |
| `usedTool?` | name of the tool called, or `undefined` if QPath already knew / no tool was bound |
| `learned` | facts actually added to the KB — `[]` if QPath already knew or the answer was volatile |
| `ephemeral?` | `true` if the tool's answer was volatile (not memorized) |

> 💡 If QPath already knows `(s, p)`, **no tool is called**: `objects` comes from memory, `learned` is
> `[]` and `usedTool` stays `undefined` — that's the whole point (zero token, zero network call on the
> second pass).

Reproducible, traceable, no LLM.

### 2. LLM-driven (TOOL move in PingPong)

In [PingPong reasoning](/en/pingpong-reasoning), the LLM can play a `TOOL` move; the tool runs, its facts
enter QPath, and the exchange continues — grounded.

```ts
import { PingPongReasoner } from '@damba/libxn';

const result = await new PingPongReasoner(kb, llm, { tools }).run('What is the weather in Paris?');
// The LLM plays: TOOL weather | city=paris  → QPath memorizes (paris, weather_of, rain) → CONCLUDE
result.factsLearned;   // [{ s: 'paris', p: 'weather_of', o: 'rain' }]
```

The **constructor** `new PingPongReasoner(kb, llm, opts?)` takes **three** arguments:

| Argument | Role | Default |
|---|---|---|
| `kb` | the `KnowledgeBase` acting as the deterministic referee (verifies each LLM move) | — (required) |
| `llm` | the `LlmPort` (the language engine that plays the moves) | — (required) |
| `opts?` | reasoner options — see below | `{}` |

`opts` fields (all optional): `tools?` (the `ToolRegistry` made available for `TOOL` moves),
`maxRounds?` (max exchanges, **default 3**), `writeBack?` (re-inject verified hypotheses into the KB,
**default `true`**), `confidence?` (confidence policy passed to `ChainResolver`), `algebra?` (predicate
algebra; defaults to `PredicateAlgebra.withDefaults()`).

`.run(question, opts?)` takes the **question** (string, required) and an optional second argument
`opts?` that **overrides for this call** the constructor's options (`maxRounds`, `writeBack`,
`confidence`, plus `seedSubject?` — a starting subject whose known facts seed the LLM — and
`systemPrompt?`). It **returns** a `Promise<PingPongResult>` whose useful fields here:
`conclusion` (the final answer), `factsLearned` (facts written during the exchange), `grounded`
(boolean: is everything grounded on QPath), `llmCalls` (number of LLM calls) and `stopped`
(`'concluded'` | `'maxRounds'` | `'stalled'`).

## Reading the KB: the LLM queries the memory

Every tool above *brings in* external data. But a tool can do the opposite: **read the deterministic
memory** so the LLM answers **from the facts**, never from guesswork. The `run` queries the
`KnowledgeBase` (`ask`, `askInverse`, `compute`, `askInherited`…) and returns the answer — **without
memorizing anything** (it's a read: `ephemeral: true`).

```ts
import { Tool, ToolResult, KnowledgeBase, type AggregateFn } from '@damba/libxn';

/** A READ tool: the LLM queries the conversation memory (no fact written). */
class KbQueryTool implements Tool {
  name = 'kb_query';
  description = 'Query the memory. Args: subject=<s> predicate=<p> (known values), '
    + 'predicate=<p> object=<o> (subjects), or compute=<p>:<fn> (avg|sum|count|min|max).';
  ephemeral = true;                       // pure read: nothing to memorize

  constructor(private kb: KnowledgeBase) {}

  async run(input: Record<string, unknown>): Promise<ToolResult> {
    const s = String(input['subject'] ?? '').trim();
    const p = String(input['predicate'] ?? '').trim();
    const o = String(input['object'] ?? '').trim();
    const compute = String(input['compute'] ?? '').trim();   // e.g. age:avg

    if (compute) {
      const [pred, fn] = compute.split(':');
      const v = this.kb.compute({ p: pred }, fn as AggregateFn);
      return { value: v, text: v === undefined ? '∅' : String(v) };
    }
    if (s && p) { const r = this.kb.ask(s, p);        return { value: r, text: r.join(', ') || '∅' }; }
    if (p && o) { const r = this.kb.askInverse(p, o); return { value: r, text: r.join(', ') || '∅' }; }
    return { text: 'args: subject=/predicate=/object= or compute=<p>:<fn>' };
  }
}
```

The **KB read methods** used in this `run`:

- **`kb.ask(s, p)`** — **direct** read: takes the subject `s` and predicate `p`, **returns** the list of
  objects `string[]` (e.g. Alice's city). Empty if unknown.
- **`kb.askInverse(p, o)`** — **inverse** read: takes the predicate `p` and object `o`, **returns** the
  **subjects** `string[]` satisfying `(?, p, o)` (e.g. "who lives in Paris?").
- **`kb.compute(filter, fn)`** — deterministic aggregate (zero token). First argument: a **fact filter**
  `{ s?, p?, o? }` (here `{ p: pred }` = "all facts with predicate `pred`"). Second argument: the
  **aggregate function** `fn` of type `AggregateFn` — one of
  `'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'variance' | 'stddev' | 'range'`. **Returns** a
  `number`, or **`undefined`** if no numeric fact matches (hence the `v === undefined ? '∅'`). `count`
  counts facts; the others apply only to **numeric** objects.

> 💡 `ephemeral = true` on the class: it's a **pure read**, so even if it returned `facts` they would not
> be memorized. Here it only returns `value`/`text` anyway.

Wire it like any tool; the LLM calls it via a `TOOL` move in PingPong:

```ts
import { ToolRegistry, PingPongReasoner } from '@damba/libxn';

const tools = new ToolRegistry().register(new KbQueryTool(kb));
await new PingPongReasoner(kb, llm, { tools }).run('What is the average age of the clients?');
// The LLM plays: TOOL kb_query | compute=age:avg → the KB computes → grounded answer, zero-token math
```

Same signatures as above: `KbQueryTool` receives the `kb` in its **constructor** (the read tool needs a
reference to the memory it queries), then `register(...)` adds it to the registry, and
`PingPongReasoner(kb, llm, { tools })` receives that registry via the `tools` option.

> **Read vs bring in**: a **read** tool returns `value`/`text` (nothing is memorized); a tool that
> **fills a gap** returns `facts` (memorized). You can scope the read by **permissions**
> (`FactVault` / `FactAccessControl`) so the LLM only sees the session's authorized facts — secrets
> decrypted only if the session allows it.

### Use-cases

| Assistant | The LLM calls | The KB answers |
|---|---|---|
| **QPath Bank** | `kb_query \| subject=account-42 predicate=balance` | the **real** balance (never invented); `compute=deposit:sum` → total deposited |
| **Law firm** | `kb_query \| subject=case-17 predicate=clause` | the case's clauses — the LLM drafts **from** them |
| **Doctor** | `kb_query \| subject=patient-9 predicate=allergy` | the real history — no clinical hallucination |
| **Team memory** | `org_memory \| subject=alice predicate=role` | the organization's **shared** memory (server-side) |

The LLM **understands** the question and **picks** the tool; QPath **executes** and **proves**. The
answer stays grounded on verifiable facts.

## Dynamic (volatile) responses

Some responses must **not** be memorized: weather, stock price, time, server status… Writing them into
QPath would create **stale facts**. Mark the tool (or a specific call) as **volatile** (`ephemeral`):
QPath **uses** the response for this turn but does **not** memorize it — so it calls the tool again next
time (fresh value).

```ts
const weather: Tool = {
  name: 'weather',
  description: 'Current weather',
  resolves: ['weather_of'],
  ephemeral: true,                         // ← never memorized (dynamic data)
  async run(input) {
    const city = String(input['subject'] ?? input['query']);
    return { facts: [[city, 'weather_of', await currentWeather(city)]] };
  },
};
```

Here `ephemeral: true` is set **on the tool** (the `Tool.ephemeral` field): it applies to **all** its
calls. For a tool that is **sometimes** stable and **sometimes** volatile, leave the tool default and set
the flag **per call** in the returned `ToolResult` (`return { facts: [...], ephemeral: true }`) — the
`ToolResult.ephemeral` overrides the tool default.

- **At the tool level**: `ephemeral: true` → all its responses are volatile.
- **Per call**: `return { facts: [...], ephemeral: true }` → overrides the tool default (useful for a tool
  that is sometimes stable, sometimes volatile).

Conversely, a **stable** fact (a country's capital, a business relation…) is memorized normally and
reused at zero token.

## Why it's useful

- **The memory grows** — a fact a tool brings back is memorized: you don't fetch it twice.
- **Grounding** — results become QPath facts, hence **auditable** (not an opaque answer). Once the
  durable facts are memorized, the returned response matches **exactly** what is actually queryable in
  memory — even if the tool had normalized the subject into another form: no gap between what the tool
  reports and what QPath knows.
- **Decoupled** — the tool is a **port**: the core depends on no API. The dev plugs in anything (web,
  calculation, internal DB…) without touching QPath.

## Tool ideas

| Tool | Brings to QPath |
|------|-----------------|
| Web search (Tavily, Brave…) | fresh web facts |
| Calculator / units | exact numeric results |
| Internal database | up-to-date business facts |
| Third-party API (weather, geo, finance…) | real-time data |
| Document reader | facts extracted from PDFs/notes |

::: tip
QPath's internals are not documented publicly. For technical access or a partnership, contact the
author. See also [PingPong reasoning](/en/pingpong-reasoning) and [Key components](/en/components).
:::
