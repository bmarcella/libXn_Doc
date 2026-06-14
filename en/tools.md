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

Tools are kept in a **registry**:

```ts
import { ToolRegistry } from '@damba/libxn';
const tools = new ToolRegistry().register(weather);
```

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

Wire it like any tool; the LLM calls it via a `TOOL` move in PingPong:

```ts
import { ToolRegistry, PingPongReasoner } from '@damba/libxn';

const tools = new ToolRegistry().register(new KbQueryTool(kb));
await new PingPongReasoner(kb, llm, { tools }).run('What is the average age of the clients?');
// The LLM plays: TOOL kb_query | compute=age:avg → the KB computes → grounded answer, zero-token math
```

> **Read vs bring in**: a **read** tool returns `value`/`text` (nothing is memorized); a tool that
> **fills a gap** returns `facts` (memorized). You can scope the read by **permissions**
> (`FactVault` / `FactAccessControl`) so the LLM only sees the session's authorized facts — secrets
> decrypted only if the session allows it.

### Use-cases

| Assistant | The LLM calls | The KB answers |
|---|---|---|
| **Damba Bank** | `kb_query \| subject=account-42 predicate=balance` | the **real** balance (never invented); `compute=deposit:sum` → total deposited |
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

- **At the tool level**: `ephemeral: true` → all its responses are volatile.
- **Per call**: `return { facts: [...], ephemeral: true }` → overrides the tool default (useful for a tool
  that is sometimes stable, sometimes volatile).

Conversely, a **stable** fact (a country's capital, a business relation…) is memorized normally and
reused at zero token.

## Why it's useful

- **The memory grows** — a fact a tool brings back is memorized: you don't fetch it twice.
- **Grounding** — results become QPath facts, hence **auditable** (not an opaque answer).
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
