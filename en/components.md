# Key components

QPath is used through a few complementary building blocks, grouped into four families: **the foundation**,
**knowledge**, **reasoning**, and **persistence & search**. This page explains **what each one is for** and
**in what situation to use it** — without going into internals.

---

## The foundation

### XNeuroneGrid — the graph

The **base structure**: the graph in which any datum is stored and retrieved. The foundation every other
component builds on.

**What it's for:** ingest any data, retrieve it exactly (or the closest), learn lightly (classification,
regression), persist the whole graph.

**When to use it:** whenever you need a **content-addressable memory** — a store where a datum's location
derives from the datum itself, with deterministic retrieval.

```ts
import { XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
await grid.processData('the cat sleeps');
grid.findValuesContaining('cat');      // retrieve by content
const snap = grid.serialize();          // persistence
```

> It is the **source of truth**: fast, in-memory, deterministic. Headless by default on the server; an
> optional 3D rendering plugs in via `@damba/libxn-visualization`.

### BinaryConverter — preparing data

The component that **turns a datum (text, number, object) into the representation the graph consumes**. It
is the default encoder: the bridge between your values and the internal structure.

**What it's for:** normalize any input **deterministically** before ingesting or searching it in the graph.
Same data → same representation, always.

**When to use it:** most of the time it's automatic (the graph uses it by default). You handle it directly
mainly for learning (preparing examples) or custom encodings.

```ts
import { BinaryConverter, XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const sample = BinaryConverter.toBinaryPairs({ area: 120, rooms: 4 });
await grid.trainClass(sample, 'house');    // prepare an example for learning
```

> The encoder choice decides **which inputs look alike** to the graph. Golden rule: the same encoder for
> ingestion and for queries.

---

## Knowledge

### KnowledgeBase — the fact layer

Builds on `XNeuroneGrid` to store **relations** as triplets *(subject, predicate, object)* rather than raw
data.

**What it's for:** remember facts ("marc likes chocolate"), query both ways, cross-reference
(intersections, unions, comparison, similarity), and infer (transitivity, inheritance with a trace).

**When to use it:** any app that needs a **queryable relations layer** — profiles, catalogs, business
ontologies, an agent's memory — without deploying a dedicated graph database.

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('marc', 'likes', 'chocolate');
kb.ask('marc', 'likes');              // ['chocolate']
kb.askInverse('likes', 'chocolate');  // ['marc']
```

> **Reliable, deterministic** reads; **editable and auditable** memory.

### CompanionFacts — facts that accompany another

Attach to an **owner** a block of facts that describe it: a person's **profile** around their
account (address, gender, date of birth…), a document's metadata, etc. The owner is either an
**entity** (a subject) or a **precise fact** (a triplet).

```ts
import { CompanionFacts } from '@damba/libxn';
const comp = new CompanionFacts(kb);

// A person's profile (owner = entity)
const owner = { entity: 'bigvai' };
await comp.attach(owner, 'bigvai', 'address', 'port-au-prince');
await comp.attach(owner, 'bigvai', 'born_on', '1991-01-01', { cascade: true });
comp.profileOf(owner);     // { address:['port-au-prince'], born_on:['1991-01-01'] }

// Metadata on a precise fact (owner = triplet)
const f = { fact: { s: 'bigvai', p: 'has', o: 'account_12345' } };
await comp.attach(f, 'account_12345', 'opened_on', '2020-06-01', { cascade: true });

// Configurable lifecycle: `cascade` → the companion leaves with its owner (archived)
comp.retractOwner(f);      // retracts the fact + its cascade companions
```

> Companions stay **ordinary facts** (queryable normally); they are merely tagged to their owner.
> `cascade` ties their lifecycle; without it they are independent.
>
> Identity-coherent: merging two entities (`mergeEntities`) keeps **one** profile (reads follow
> aliases), and splitting a fact (`splitEntity`) **rebinds** its companions to the new id.

**Advanced use-cases**

```ts
// 1) Bank KYC — TWO lifecycles under the same owner
const client = { entity: 'bigvai' };
await comp.attach(client, 'bigvai', 'address', 'port-au-prince');                 // survives (non-cascade)
await comp.attach(client, 'bigvai', 'id_document', 'cin-4421', { cascade: true }); // perishable
// → purging the KYC file removes the ID, KEEPS the address.

// 2) Metadata of an ingested document (owner = a precise fact)
const doc = { fact: { s: 'doc_42', p: 'is', o: 'document' } };
await comp.attach(doc, 'doc_42', 'sha256', 'a1b2…', { cascade: true });
await comp.attach(doc, 'doc_42', 'ingested_on', '2026-06-13', { cascade: true });
comp.retractOwner(doc);   // purges the document AND all its metadata at once

// 3) The profile SURVIVES an identity merge
await kb.mergeEntities('bob', 'robert');
comp.profileOf({ entity: 'robert' });   // returns bob's profile — a single one, nothing re-tagged
```

- **Two lifecycles side by side**: mark `cascade` what must die with the owner (IDs, technical
  metadata), leave the rest independent (address, preferences).
- **Companion = ordinary fact**: still queryable (`ask`, `compute`, `matchFacts`) and can be
  **secret** (`FactVault.setSecret` then `comp.tag`) or attached to an **access group** —
  `profileOf` then only reveals what the session allows.
- **Entity-owner vs fact-owner**: the **entity** for a durable profile of a person/thing; the
  **fact** for metadata of a precise statement (provenance, score, timestamp).


### NaturalParser — from language to facts

The **bridge between free text and the KnowledgeBase**: it turns a natural-language sentence into a
structured fact ready to be remembered.

**What it's for:** read a simple sentence (FR/EN), extract the relation, tell a usable statement apart from
a question or vague sentence, and feed the KB without writing triplets by hand.

**When to use it:** to **ingest written knowledge** — notes, documents, web-search results, user messages.
The natural entry point into QPath memory.

```ts
import { NaturalParser } from '@damba/libxn';

const parsed = NaturalParser.parse('the cat is an animal');
if (parsed.kind === 'statement') {
  await kb.tell(parsed.s, parsed.p, parsed.o);   // cat / is / animal
}
```

The parser goes well beyond schoolbook "X is Y":

```ts
// Natural relations: the predicate carries the whole relation (no snake_case to type)
NaturalParser.parse('Alice est la mère de Bob');   // → { s:'alice', p:'mère_de', o:'bob' }
NaturalParser.parse('Paris est la capitale de la France'); // → { s:'paris', p:'capitale_de', o:'france' }

// Negation → not_<p> predicate
NaturalParser.parse('le pingouin ne vole pas');    // → { s:'pingouin', p:'not_vole', o:'…' }

// Multiple facts in one message (parseAll)
NaturalParser.parseAll('Alice est la mère de Bob. Bob est le père de Carl');
// → [ {s:'alice',p:'mère_de',o:'bob'}, {s:'bob',p:'père_de',o:'carl'} ]
```

> A **permissive, cautious** parser: it tells a statement apart from a **question** ("which dog…",
> even without "?") and from a **reply** ("I think that…") — which it does not store. When in doubt,
> it prefers to assert nothing rather than invent.

### NaturalRuleParser — from language to rules

The rule counterpart of `NaturalParser`: it turns a conditional sentence into a **rule DSL** ready for
`RuleEngine.addRuleFromText` (via `RuleFactory.refine`).

**What it's for:** let a human write a rule in plain language, without knowing the `=>` syntax.

**When to use it:** in a knowledge-entry flow, to propose a rule for the human to **validate**.

```ts
import { NaturalRuleParser } from '@damba/libxn';

NaturalRuleParser.parse('If someone is human then they are mortal');
// → { dsl: 'X is human => X are mortal', conditions:[…], conclusions:[…] }

NaturalRuleParser.parse('Tout humain a deux jambes');   // universal
// → { dsl: 'X est humain => X a deux_jambes', … }
```

Recognizes "**if … then …**" / "si … alors …", the **arrow** (`=>`/`⇒`/`→`) and the **universal**
"every/all/tout ‹class› …". Handles FR/EN, **negation** (`ne … pas` → `not_*`), **relations**
("la mère de X" → `mère_de`) and **pronoun coreference** (he/she/they/il/elle → the variable `X`).

> **Conservative**: returns `null` when the structure is ambiguous or there is **no shared variable**
> between conditions and conclusion (then it isn't a real general rule). Like `NaturalParser`, it
> prefers to propose nothing rather than invent — the final call goes to `RuleFactory`, then the human.

---

## Reasoning

### ChainResolver — chaining facts

The **backward-chaining** reasoning engine: from known facts, it finds a **chain** leading to a conclusion,
and provides its **trace**.

**What it's for:** answer "why / how do we get to…" by linking several facts (e.g. *socrates is human →
human is mortal → mortal has an end*), with a readable explanation.

**When to use it:** when the answer is not a direct fact but the **result of a deduction**, and especially
when you must **show the path** (healthcare, finance, legal, compliance).

```ts
import { ChainResolver } from '@damba/libxn';

const chain = new ChainResolver(kb).chain('socrates', 'has');
ChainResolver.format(chain!);
// → "socrates —is→ human —is→ mortal —has→ end  (⇒ has = end, confidence 1.00)"
```

> **Lazy**: computes on demand, at query time, storing nothing. Deterministic and traceable.

### RuleEngine — deriving new facts

The **forward-chaining** engine: you declare business rules, and each new fact **triggers** the rules to
produce derived facts (with their provenance).

**What it's for:** materialize consequences ahead of time ("whoever uses TypeScript understands
JavaScript"), apply policies, automatically enrich the base.

**When to use it:** when you have **explicit business rules** and want the base to complete itself as facts
are added — rule engines, access policies, scoring, conditional workflows.

```ts
import { RuleEngine } from '@damba/libxn';

const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X uses typescript => X understands javascript');
await rules.applyAllRules();
kb.askInverse('understands', 'javascript');   // includes the derived facts
```

> **Dual of ChainResolver**: `RuleEngine` anticipates (at write time), `ChainResolver` computes on demand
> (at query time). Both can share the same rules.

### PingPongReasoner — reasoning with an LLM, grounded on QPath

Reasoning by a **short, alternating exchange between QPath and an LLM**: the LLM advances step by step,
QPath **validates each step** (anti-hallucination), and the memory grows along the way.

**What it's for:** solve **open-ended or multi-step** questions that QPath alone can't conclude, without
letting the LLM invent — every claim is checked against QPath.

**When to use it:** when `ChainResolver` isn't enough but **each step** toward the answer is verifiable by
QPath. The LLM is supplied via a port (`LlmPort`), so it's provider-independent.

```ts
import { PingPongReasoner } from '@damba/libxn';
const result = await new PingPongReasoner(kb, llm).run('Is Alice an ancestor of Diana?', { seedSubject: 'alice' });
result.conclusion;   // grounded answer ; result.transcript = the full exchange
```

> Details and safeguards: see [PingPong reasoning](pingpong-reasoning).

---

## Persistence & search

### VectorStore — plugging in a vector database (similarity search)

The `VectorStore` port connects QPath to a vector database for **similarity search** (by path or by
meaning). Adapters: `InMemoryVectorStore` (core, reference/offline), `QdrantVectorStore`
(`@damba/libxn-qdrant`), **pgvector** (Damba backend).

**What it's for:** retrieve the items **closest** to a query — beyond exact matching
(recommendation, "similar items", record matching).

> For **durable fact persistence**, the dedicated layer handles it (`KbStore` / `FactStore` /
> `DurableKnowledgeBase`) — see [Persistence](/en/persistence). The vector database serves semantic
> search; the two are orthogonal.

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));
await store.save('my-kb', kb.grid.serialize());     // persist
const hits = await store.searchSimilarPaths('my-kb', queryPath, 5);
```

> QPath depends on **no** particular vector database: Qdrant is just an adapter. For pgvector, Pinecone, an
> in-memory store… you provide another adapter, **the core does not change** (see
> [Architecture](04-guides/architecture)).

---

## How they fit together

```
                 BinaryConverter         ChainResolver / RuleEngine
                 (prepares data)           (reason over the facts)
                       │                            │
   free text ─▶ NaturalParser ─▶ KnowledgeBase ─▶ XNeuroneGrid ─▶ VectorStore
                (language→fact)    (facts & queries)  (the graph, foundation)  (similarity search)
                                          │
                                   KbStore / FactStore (durable persistence — see Persistence)
```

`XNeuroneGrid` is the foundation; `BinaryConverter` lets data in; `KnowledgeBase` and `NaturalParser` add
meaning; `ChainResolver` and `RuleEngine` reason on top; a `VectorStore` adapter (pgvector, Qdrant…)
provides similarity search, and the [Persistence](/en/persistence) layer (`DurableKnowledgeBase`)
provides durable facts.

::: tip
The internals of these components (encoding, indexing, algorithm) are not documented publicly. For
technical access or a partnership, contact the author.
:::
