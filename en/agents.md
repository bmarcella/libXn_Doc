# Agents & RAG

The `@damba/libxn-agents` package links QPath memory to an LLM **with no hard dependencies**:
multi-source retrieval (`Retriever`), a compact LLM↔QPath protocol (`QPathDSL`), a conversational
orchestrator (`LLMOrchestrator`) and **autonomous agents** (curation, research, tutoring). All
transports (LLM, web, semantic) enter through injected **ports**.

> 💡 **The LLM converses, QPath remembers.** The model brings language; memory brings exact, traceable,
> persistent facts. One does not replace the other.

## Retrieve from several sources

```ts
import { Retriever } from '@damba/libxn-agents';

const retriever = new Retriever(kb, semanticIndex, webSearcher);

const hits = await retriever.retrieve('alice works', {
  strategy: 'symbolic-first',          // 'symbolic-first' | 'semantic-first' | 'hybrid' | 'web-fallback'
  sources: ['symbolic', 'semantic', 'web'],
  limit: 5,
});
//    → [{ content: 'alice works libxn', source: 'symbolic', score: 0.95 }, …]
```

- **`new Retriever(kb, semanticIndex?, webSearcher?)`** — unifies symbolic memory, semantic index and
  web. **`retrieve(query, opts)` → `Promise<RetrievalResult[]>`** — returns scored snippets per
  **strategy** (exact first, web as fallback, or a blend).

## Talk to memory in few tokens — QPathDSL

Instead of a large JSON, the LLM reads/writes memory through a compact grammar (≈ **−75% tokens**).

```ts
import { parse, execute } from '@damba/libxn-agents';

await execute(parse('?alice.works'), kb, retriever);    // direct facts → 'alice works libxn'
await execute(parse('??alice.colleague'), kb, retriever); // multi-hop reasoning (?? = 2-3 hops)
await execute(parse('?age>60'), kb, retriever);          // numeric → 'bob age 71'
await execute(parse('alice works libxn'), kb, retriever); // writes the fact
```

| Syntax | Effect |
|---|---|
| `?x` | a subject's index (its predicates) |
| `?x.p` | direct facts `(x, p, ?)` |
| `??x.p` | multi-hop reasoning (inheritance/chain) |
| `?x p y` | check a triple → `y`/`n` |
| `x p y` | write the triple (`tell`) |
| `?avg:p` · `?count:x.p` | deterministic aggregates |

- **`parse(cmd)` → `Command`** then **`execute(cmd, kb, retriever)` → compact output** — read, write,
  aggregate, reason, in a few characters.

## An assistant that remembers

```ts
import { LLMOrchestrator } from '@damba/libxn-agents';

const orch = new LLMOrchestrator(llmChatPort, kb, retriever);
const { response, toolCalls, inputTokens } = await orch.chat('Who works where?', history);
```

- **`new LLMOrchestrator(llmChatPort, kb, retriever, model?)`** — exposes a single `q(cmd)` tool (DSL)
  to the LLM, instead of many JSON tools. **`chat(message, history, toolNames?)` → `Promise<{ response, toolCalls, … }>`**
  — one turn: the model queries/writes memory via the DSL, then synthesizes.

## Autonomous agents

```ts
import { CuratorAgent, ResearcherAgent, TutorAgent } from '@damba/libxn-agents';

await new CuratorAgent(llm, kb, retriever).run('');                 // audits the KB (contradictions, dupes)
await new ResearcherAgent(llm, kb, retriever, web, { targetFactsCount: 20 }).run('immunotherapy');
await new TutorAgent(llm, kb, retriever).run('relativity');         // quizzes the user on the KB
```

- **`CuratorAgent`** — audits memory (contradictions, duplicates, weak facts) and **proposes** fixes.
  **`ResearcherAgent`** — loops web→facts until it reaches a learned-facts goal. **`TutorAgent`** — asks
  questions grounded in the KB. All via **`run(input, opts?)` → `AgentResult`** (bounded by
  `maxIterations`), the LLM as **author**, writes validated.

## Long documents

```ts
import { DocumentStore } from '@damba/libxn-agents';

const docs = new DocumentStore(kb);
await docs.add({ title: 'Marcella CV', content: '…', entities: ['marcella', 'libxn'] });
docs.findByEntity('libxn');     // documents mentioning the entity
```

- **`DocumentStore`** — keeps long content (CVs, articles) **and** cross-references mentions in the KB:
  **`add(doc)`**, **`findByEntity(e)`**, **`findRecent(ms)`**, **`get/list/remove`**.

## Use cases

| Situation | Building block |
|---|---|
| Chatbot with **persistent memory** that grows | `LLMOrchestrator` + `Retriever` |
| Hybrid RAG (exact facts + meaning + web) | `Retriever` (4 strategies) |
| Cut the token cost of LLM↔memory exchanges | `QPathDSL` |
| **Clean** a large memory automatically | `CuratorAgent` |
| **Enrich** a topic from the web, unattended | `ResearcherAgent` |

> 🔌 **Ports, not dependencies.** `LlmChatPort`, `SearchPort`, `SemanticIndexPort`: the app plugs in its
> LLM, its search engine and its index. No URL or key inside the package.
