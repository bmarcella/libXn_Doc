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

In [PingPong reasoning](pingpong-reasoning), the LLM can play a `TOOL` move; the tool runs, its facts
enter QPath, and the exchange continues — grounded.

```ts
import { PingPongReasoner } from '@damba/libxn';

const result = await new PingPongReasoner(kb, llm, { tools }).run('What is the weather in Paris?');
// The LLM plays: TOOL weather | city=paris  → QPath memorizes (paris, weather_of, rain) → CONCLUDE
result.factsLearned;   // [{ s: 'paris', p: 'weather_of', o: 'rain' }]
```

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
author. See also [PingPong reasoning](pingpong-reasoning) and [Key components](components).
:::
