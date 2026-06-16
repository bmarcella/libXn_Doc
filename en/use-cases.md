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

## 8. Causal & temporal reasoning (post-mortems, investigations)

Walk back to root causes, unroll consequences, order a timeline, spot incoherences (a cause proven to
occur *after* its effect) — over events stored as facts, deterministically.

**Domains.** Incident post-mortems, case files, histories, narratives. → [Plot reasoning](plot-reasoning).

## 9. Proactive detection (anomalies, contradictions, gaps)

The memory **speaks without being asked**: it flags contradictions, near-rules violated by a single case,
missing attributes, stale facts.

**Domains.** Data quality, continuous compliance, monitoring, curation. → [Proactive deduction](insight-reasoning).

## 10. Open-ended reasoning without hallucination (LLM ↔ QPath)

The LLM proposes a step, QPath **verifies** it; validated hypotheses are written back and reusable at
0 tokens. No unverified claim is kept.

**Domains.** Reliable assistants, tool-using agents, grounded Q&A. → [PingPong reasoning](pingpong-reasoning).

## 11. Identity, secrets & access control

Model authentication, **secret** facts (encrypted at rest, hidden from normal reads), access **guards**
and audit — directly in the facts, crypto wired through ports.

**Domains.** Vaults, enterprise RBAC, audit trails. → [Access layer](access-layer).

## 12. Accounts & wallets (append-only)

**Immutable** movements, **computed** balance (never mutated), constraints (floor / ceiling / velocity),
pre-validated transfers.

**Domains.** Wallets, loyalty points, credits, quotas. → [Transaction ledger](transaction-ledger).

## 13. Multi-tenant & dev/prod (layers)

**Default values** (organization / generic) overridden per user or conversation; test facts in a **dev**
overlay without touching **prod**, then promote.

**Domains.** Multi-tenant SaaS, personalization, environments. → [Layers](layers).

## 14. Dynamic code: the app's behavior in facts

The control flow (conditions, loops, actions) lives in facts; **adding a fact changes behavior with no
redeploy**, tested in dev and promoted to prod **under validation**.

**Domains.** Deterministic low-code, advanced feature flags, hot-reconfigurable apps. → [Dynamic behavior](dynamic-behavior).

---

## All advantages at a glance

| Advantage | What it gives |
|-----------|---------------|
| **Deterministic** | same facts → same answers; reproducible |
| **0 tokens** | instant, free reads & reasoning; latency independent of size |
| **Traceable** | every conclusion carries its proof chain |
| **Persistent & editable** | auditable, fixable memory that accumulates |
| **Anti-hallucination** | LLM ↔ QPath grounding; nothing invented is kept |
| **Temporal** | provenance, freshness (TTL), archives (validity windows) |
| **First-class entities** | aliases / homonyms, merge / split with proof |
| **Native security** | encrypted secrets, access control, audit — as facts |
| **Multimodal** | text, image, audio → one substrate |
| **Hybrid** | symbolic + semantic (pgvector / Qdrant) + web |
| **Versioned** | tagged releases, rollback (archives) |
| **Durable** | Postgres / pgvector; survives restarts |
| **Dependency-free** | isomorphic (Node, browser, Web Worker), transports via ports |
| **Proactive** | surfaces anomalies / contradictions unprompted |

## What it brings that's new

- **A single structure** is at once **storage, index, reasoner, and execution substrate** — not a stack of
  separate tools to integrate.
- **Application behavior as data**: you reconfigure an app **hot**, via facts, under validation — no redeploy.
- **A memory that speaks without being asked**: it anticipates (contradictions, gaps, similarities).
- **A natively temporal, traced memory**: it knows *when* a fact was true, *where* it came from, and
  *whether* it's still fresh.
- **Several reasoning modes on the same substrate**: deduction, causal/temporal, proactive, LLM-verified
  hybrid — without switching systems.
- **Cost and latency independent of size** for reads and targeted reasoning.

---

::: tip Going further
Vector search via `@damba/libxn-postgres` (pgvector) or `@damba/libxn-qdrant`, 3D graph visualization
via `@damba/libxn-visualization`. See [Architecture](04-guides/architecture).
:::
