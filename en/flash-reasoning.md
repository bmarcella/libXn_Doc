# Flash reasoning · web · LLM (LangChain)

QPath stays the **brain**: it stores facts and reasons **deterministically, at zero token**. You can add
two peripheral layers for more power **without taking that role away**:

- **LangChain** = the LLM connector (verbalization, question decomposition). The LLM decides nothing and
  invents nothing: it dresses up the facts QPath provides.
- **Tavily** = web search, to fill a knowledge gap. Found facts are **fed back into QPath**, so the
  memory grows and stays reusable at zero token afterwards.

> Principle: **QPath decides and remembers; the LLM verbalizes; the web fills gaps.** Answers stay
> grounded in verifiable facts, not in the model's hallucinations.

## Installation

```bash
npm install @damba/libxn @langchain/anthropic @langchain/community
```

## 1. Connect an LLM via LangChain

A thin connector: QPath only needs a `prompt(text) → string`.

```ts
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({
  model: 'claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
  temperature: 0,           // deterministic: the LLM only reformulates
});

async function verbalize(prompt: string): Promise<string> {
  const res = await model.invoke(prompt);
  return String(res.content);
}
```

The `new ChatAnthropic({...})` constructor (external `@langchain/anthropic` package) takes an options object:

| Argument | Role | Default |
|---|---|---|
| `model` | the model id to call (e.g. `'claude-sonnet-4-6'`) | depends on the package version |
| `apiKey` | the API key; read from the environment, never hard-coded | `process.env.ANTHROPIC_API_KEY` if omitted |
| `temperature` | generation randomness; `0` = deterministic output (the LLM only reformulates, it doesn't invent) | depends on the package |

`model.invoke(prompt)` takes the **prompt text** (string) and returns a message object; the text is
extracted via `res.content` (hence the `String(res.content)` that normalizes it to a string). Our
`verbalize` function thus exposes only what QPath needs: a `prompt(text) → string`.

> Any LangChain model works (`ChatOpenAI`, `ChatOllama`, `ChatMistralAI`…) as long as it exposes
> `invoke()`. QPath stays provider-independent.

## 2. Web search with Tavily

```ts
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';

const web = new TavilySearchResults({ maxResults: 5, apiKey: process.env.TAVILY_API_KEY });

async function searchWeb(query: string): Promise<string[]> {
  const raw = await web.invoke(query);             // JSON string
  return JSON.parse(raw).map((r: any) => `${r.title} — ${r.content}`);
}
```

The `new TavilySearchResults({...})` constructor (external `@langchain/community` package):

- **`maxResults`** — the maximum number of web results returned per query (here `5`). Higher gives more
  material to feed back, but makes the call costlier.
- **`apiKey`** — the Tavily API key, read from the environment (`process.env.TAVILY_API_KEY`).

`web.invoke(query)` takes the **search query** (string) and returns a **JSON string** (hence the
`JSON.parse(raw)`): an array of result objects, of which we only use `title` and `content` here.

## 3. Flash reasoning: QPath first, web as backup, LLM to finish

The core of the pattern. Always query **QPath first** (free, instant). Hit the web **only** if memory
doesn't cover the question — and **store** what you learn.

```ts
import { XNeuroneGrid, KnowledgeBase, NaturalParser } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

async function flashAnswer(question: string, subject: string, predicate: string): Promise<string> {
  // ── 1. QPath first: zero token, deterministic ──
  let facts = kb.ask(subject, predicate);

  // ── 2. Knowledge gap? → web (Tavily), then feed back into QPath ──
  if (facts.length === 0) {
    const snippets = await searchWeb(question);
    for (const s of snippets) {
      const parsed = NaturalParser.parse(s);
      if (parsed.kind === 'statement') {
        await kb.tell(parsed.s, parsed.p, parsed.o);   // the memory grows
      }
    }
    facts = kb.ask(subject, predicate);                // re-read from QPath
  }

  // ── 3. The LLM verbalizes, grounded on QPath facts (nothing invented) ──
  return verbalize(
    `Verified facts (QPath): ${facts.join(', ') || 'none'}\n` +
    `Question: ${question}\n` +
    `Answer ONLY from the facts above. If empty, say so.`,
  );
}
```

The QPath functions used above:

`new XNeuroneGrid(undefined, { headless: true })` — builds the in-memory graph:

| Argument | Role | Default |
|---|---|---|
| `encoder?` | the input → binary-pairs encoder; `undefined` = default encoder (`BinaryConverter.toBinaryPairs`) | `undefined` |
| `opts.headless?` | `true` = no renderer attached (Node/server); in visual mode a `viewFactory` must be registered | `false` |

`new KnowledgeBase(grid)` — takes **a single argument**, the QPath grid to reason over; it rebuilds its
indices at construction (useful when the grid comes from a reloaded snapshot).

`kb.ask(subject, predicate)` — two arguments, the **subject** and the **predicate**; returns the
**array of objects** `string[]` stored for that pair (alias merging included), `[]` if none. This is the
deterministic zero-token read.

`kb.tell(s, p, o, source?, flags?)` — records a fact. The first three (subject, predicate, object) are
required; `source?` attaches provenance and `flags?` the flags (`closed`, `major`…) — both optional and
omitted here. Async; returns a `ContradictionReport` if the exact opposite already exists, otherwise
`null`.

`NaturalParser.parse(text)` — **static** method, a single argument (free text). Returns a `ParsedInput`
discriminated by `kind`:
- `'statement'` → `{ kind, s, p, o }` (an assertion, the only case we store here);
- `'what'` / `'yesno'` / `'list'` → a **question** (never stored);
- `'unknown'` → `{ kind, text }` (not interpretable).

> 💡 We only `tell` when `kind === 'statement'`: a question (`what`/`yesno`/`list`) must never pollute
> the memory. Checking `parsed.kind` before accessing `parsed.s/p/o` is mandatory — those fields don't
> exist on the other variants (TypeScript enforces this).

**What you gain.** The next time a similar question is asked, QPath answers on its own — **zero token,
zero web call**. The LLM is only used for form, and it's *grounded*: it cannot contradict the memory.

## 4. Multi-hop reasoning + trace (still QPath)

**The problem.** Many answers are written nowhere: they are **deduced** by chaining several facts. "Is Lea
Paul's grandmother?" is not a stored fact, but follows from "Lea is a parent of Marie" and "Marie is a
parent of Paul". So you must **compose links**, and, to stay auditable, **show the path** that leads to the
conclusion.

`ChainResolver` does exactly that, at 0 tokens, and returns a **readable trace**: the path IS the explanation.

```ts
import { KnowledgeBase, XNeuroneGrid, ChainResolver, PredicateAlgebra } from '@damba/libxn';

// The working KB (populated by hand here; in practice these facts come from ingestion).
const kb = new KnowledgeBase(new XNeuroneGrid());
await kb.tell('lea', 'parent_of', 'marie');
await kb.tell('marie', 'parent_of', 'paul');

// The algebra declares HOW to compose: two 'parent_of' in a row make one 'grandparent_of'.
const algebra = PredicateAlgebra.withDefaults()
  .declareComposition('parent_of', 'parent_of', 'grandparent_of');

// Look for a chain from 'lea' to an object via the COMPOSED predicate 'grandparent_of'.
const chain = new ChainResolver(kb, algebra).chain('lea', 'grandparent_of');

ChainResolver.format(chain!);
// → "lea —parent_of→ marie —parent_of→ paul  (⇒ grandparent_of = paul, confidence 1.00)"
```

**The key point**: the conclusion ("grandparent_of = paul") comes **with its path**. You can then ask an
LLM to put this trace into a sentence, **without it inventing the reasoning** — it only verbalizes a path
already proven by QPath.

The three pieces, briefly:

- **`new ChainResolver(kb, algebra?)`** — the resolver, over a `KnowledgeBase`. Without `algebra` it uses
  `PredicateAlgebra.withDefaults()`; you only pass one for custom compositions (as above).
- **`chain(s, targetP)`** — the **shortest** chain linking `s` to an object via the composed predicate
  `targetP`. Returns a `ReasoningChain` (links, conclusion, confidence), or **`null`** if none exists (hence
  the `chain!` when you know it does). Depth-bounded; confidence aggregates the links (by default, that of
  the weakest link).
- **`ChainResolver.format(chain)`** — static; turns a `ReasoningChain` into a **human-readable one-line
  trace**.

**Use case.** Answer a kinship / hierarchy / location question nobody entered verbatim ("her grandmother?",
"which continent?"), providing the **proof** of the reasoning, not just the result.

> **Honest confidence, even against the grain.** When a chain follows a relation in the **inverse**
> direction, its confidence reflects that of the real underlying fact — not an assumed certainty. A
> conclusion drawn through an uncertain inverse link is therefore no longer artificially over-confident.

## 5. When reasoning exceeds QPath → delegate to the LLM

QPath is unbeatable at **symbolic, deterministic** reasoning (inheritance, transitivity, declared
compositions). But some reasoning exceeds it: **open-ended or fuzzy** questions, **multi-variable joins**
(e.g. "who is X's grandparent via two relations"), **common-sense** inference, **creative** synthesis.
There, you **delegate to the LLM** — but hand it the QPath facts as a foundation, so it reasons *from the
verifiable* rather than from nothing.

The pattern is an **escalation**: QPath tries first (deterministic, zero token); if it doesn't conclude,
the LLM takes over with QPath context.

```ts
import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const resolver = new ChainResolver(kb);

async function reason(subject: string, predicate: string, question: string): Promise<string> {
  // ── 1. QPath first: deterministic, traceable reasoning ──
  const chain = resolver.chain(subject, predicate);
  if (chain) {
    return ChainResolver.format(chain);            // exact answer, zero token, proven
  }

  // ── 2. Beyond QPath's reach → delegate to the LLM, grounded on known facts ──
  const facts = kb.askDeep(subject, 2);            // everything QPath knows about the subject (multi-hop)
  return verbalize(
    `Verified facts (QPath):\n${facts.map(f => `- ${f.via.join(' → ')}: ${f.value}`).join('\n') || 'none'}\n\n` +
    `Question (complex reasoning): ${question}\n` +
    `Reason from the facts above. Separate what is certain (from the facts) ` +
    `from what is a hypothesis.`,
  );
}
```

`kb.askDeep(s, maxDepth?)` — **multi-predicate BFS**: everything QPath knows about subject `s` by
following any predicate up to `maxDepth` hops.

- **`s`** — the starting subject (required).
- **`maxDepth?`** — the maximum number of hops; defaults to `3` (here we pass `2`).

Returns an array `{ value: string; via: string[] }[]`: each reachable object with the **predicate chain**
(`via`) leading to it — hence `f.via.join(' → ')` and `f.value` when building the prompt.

**The rule.** Whatever *can* be solved by QPath is — deterministic, free, proven. The LLM only handles
the **residue** the symbolic layer doesn't cover, and stays **grounded**: it explicitly separates the
certain (QPath facts) from the hypothetical. You keep the best of both: QPath's rigor **and** the LLM's
flexibility, without paying for flexibility everywhere.

> Note: multi-variable joins are on QPath's **roadmap** — as the core covers them, the share delegated
> to the LLM shrinks. The boundary moves toward QPath, not the other way.

## Why this architecture

| Layer | Role | Cost |
|-------|------|------|
| **QPath** (`@damba/libxn`) | memory + deterministic reasoning (priority) | zero token, instant |
| **Tavily** (LangChain) | fresh web facts, fed back into QPath | one call, **once** |
| **LLM** (LangChain) | verbalization + complex out-of-scope reasoning, grounded on QPath | minimized tokens |

Result: fewer calls, fewer tokens, **no hallucination** (everything grounded in a verifiable memory),
and knowledge that **accumulates** instead of being re-paid every turn.
