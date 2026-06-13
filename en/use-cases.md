# Use cases

QPath is a **fact memory + a reasoning engine** in a single structure: deterministic, zero-token, and
runnable anywhere (Node, browser, Web Worker). Here is where it shines — and how to integrate it.

## 1. Memory for AI agents / assistants

**The problem.** An LLM agent "forgets" between turns, re-pays tokens to re-supply context, and can
hallucinate its own memories.

**With QPath.** The agent writes its facts into QPath and reads them back deterministically, at zero token.

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';
const memory = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

// the agent remembers across the conversation
await memory.tell('user', 'prefers', 'tea');
await memory.tell('project-x', 'uses', 'typescript');

// then reads back, with no model call
memory.ask('user', 'prefers');          // ['tea']
memory.askInverse('uses', 'typescript'); // ['project-x']
```

**How to integrate.** Before replying, the agent queries QPath for its context; afterward, it writes new
facts. The memory stays **auditable and editable** — you can read and fix what it knows.

## 2. Application knowledge graph (no graph DB)

**The problem.** Many apps need a queryable relations layer, but deploying a graph database (Neo4j…) is
heavy.

**With QPath.** Triplets `(subject, predicate, object)`, direct/inverse queries, intersections.

```ts
await kb.tell('marc', 'likes', 'chocolate');
await kb.tell('julie', 'likes', 'chocolate');
await kb.tell('marc', 'lives_in', 'montreal');

kb.askInverse('likes', 'chocolate');                            // ['marc', 'julie']
kb.askIntersect([['likes', 'chocolate'], ['lives_in', 'montreal']]); // ['marc']
```

**Domains.** Product catalogs, user profiles, business ontologies, lightweight CRM, FAQ engines.

## 3. Recommendation & similarity

```ts
kb.askSimilar('marc', 3).map(r => r.subject);  // subjects closest to 'marc'
kb.askCompare('marc', 'julie');                // common + distinctive facts
```

**Domains.** "Similar profiles", "related products", record matching.

## 4. Explainable reasoning (healthcare, finance, legal, compliance)

**The problem.** In regulated domains, an answer must be **justifiable** — not a black box.

**With QPath.** Reasoning produces a **readable, deterministic trace**.

```ts
import { ChainResolver } from '@damba/libxn';
await kb.tell('case-42', 'is', 'resident');
await kb.tell('resident', 'entitled_to', 'benefit-A');

const chain = new ChainResolver(kb).chain('case-42', 'entitled_to');
ChainResolver.format(chain!);
// → "case-42 —is→ resident —entitled_to→ benefit-A  (⇒ entitled_to = benefit-A, confidence 1.00, via transitive)"
```

**Domains.** Eligibility (insurance, social benefits), compliance, clinical decision support, legal
reasoning — anywhere you must show **why**.

## 5. Business rules & derived facts

```ts
import { RuleEngine } from '@damba/libxn';
const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X uses typescript => X understands javascript');
await rules.applyAllRules();

kb.askInverse('understands', 'javascript'); // includes every TS user (derived fact)
```

**Domains.** Rule engines, access policies, conditional workflows, risk scoring.

## 6. Embedded, offline & sovereign AI

QPath is **isomorphic and dependency-free**: it runs in the browser, in Node, in a Web Worker. No data
leaves, no network call, no per-query cost.

**Domains.** Offline mobile/desktop apps, sensitive sectors (private data that must not leave the
device), edge computing, browser extensions.

## 7. Lightweight classification & scoring

The graph learns from a few examples and predicts — no training pipeline, no GPU.

```ts
import { BinaryConverter } from '@damba/libxn';
const grid = new XNeuroneGrid(undefined, { headless: true });

await grid.trainClass(BinaryConverter.toBinaryPairs({ area: 120, rooms: 4 }), 'house');
await grid.trainClass(BinaryConverter.toBinaryPairs({ area: 35, rooms: 1 }), 'studio');

grid.predictClass(BinaryConverter.toBinaryPairs({ area: 110, rooms: 4 })).label; // 'house'
```

**Domains.** Fast tagging/triage, embedded scoring, ML prototyping with no infrastructure.

---

::: tip Going further
Vector search via `@damba/libxn-postgres` (pgvector) or `@damba/libxn-qdrant`, 3D graph visualization
via `@damba/libxn-visualization`. See [Architecture](04-guides/architecture).
:::
