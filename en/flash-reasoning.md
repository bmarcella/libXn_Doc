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

**What you gain.** The next time a similar question is asked, QPath answers on its own — **zero token,
zero web call**. The LLM is only used for form, and it's *grounded*: it cannot contradict the memory.

## 4. Multi-hop reasoning + trace (still QPath)

Even enriched by the web, the reasoning stays **deterministic and traceable** on the QPath side:

```ts
import { ChainResolver } from '@damba/libxn';

const chain = new ChainResolver(kb).chain('socrates', 'has');
ChainResolver.format(chain!);
// → "socrates —is→ human —is→ mortal —has→ end  (⇒ has = end, confidence 1.00)"

// You can then have the LLM verbalize THIS trace, without it inventing the path:
await verbalize(`Explain this reasoning in one sentence: ${ChainResolver.format(chain!)}`);
```

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
