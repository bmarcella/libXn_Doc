# Provenance & re-verification

A fact isn't just "true": it comes from somewhere, at some point in time — and **it can be true
today and false tomorrow**. QPath therefore attaches a **provenance** to every fact (who, when,
where from), derives a **freshness** from it, and can **re-verify** an expired fact through the
very channel that produced it.

> **Every fact knows where it comes from. Its source says how to re-verify it. And nothing is
> ever erased: memory becomes temporal.**

## Provenance: every fact has sources

`tell` accepts an optional source — origin type (`kind`), reference (`ref`: URL, document id,
tool name…), timestamp, confidence:

```ts
await kb.tell('marcella', 'works_at', 'damba', { kind: 'user' });
await kb.tell('bitcoin', 'is_worth', '60000', { kind: 'web', ref: 'https://example.org/price' });

kb.sourcesOf('bitcoin', 'is_worth', '60000');
// → [{ kind: 'web', ref: 'https://example.org/price', at: 1760000000000 }]
```

Available `kind`s: `user` (stated by the user), `document` (extracted from an ingested document),
`web`, `tool`, `llm-verified` (LLM hypothesis verified then memorized), `inference` (derived by
reasoning), `import`.

Restating a fact overwrites nothing: **sources accumulate** — a fact confirmed through three
channels carries three sources. And QPath's whole write path already sources its facts
automatically: PingPong marks `llm-verified`, tools mark `tool` + their name, research agents
mark `web` + the URL.

## Freshness: a fact can expire

A **freshness policy** gives facts a lifetime based on their origin — the web expires fast, a
document is stable — with fine-grained overrides per predicate ("is_worth" is volatile,
"born_in" is eternal):

```ts
kb.statusOf('bitcoin', 'is_worth', '60000');  // 'fresh' → then, 31 days later: 'stale'
kb.staleFacts();                               // every fact due for re-verification
```

A `stale` fact is not deleted — it is a **candidate for re-verification**.

## Re-verification: memory tracks the world

The `FactVerifier` re-verifies a fact **through the channel its source points to**: a fact that
came from a tool calls the same tool again; for other origins you plug in your own channels
(web re-search, LLM re-verification, asking the user again):

```ts
import { FactVerifier } from '@damba/libxn';

const verifier = new FactVerifier(kb, {
  tools,                                              // built-in channel: kind 'tool'
  reverifiers: {
    web: async (s, p) => await mySearch(s, p),        // injected channel: kind 'web'
  },
});

await verifier.verify('paris weather', 'is', 'rain');
// → { verdict: 'confirmed' }    : the fact still holds, its freshness is re-stamped
// → { verdict: 'contradicted', current: ['sun'] } : reality changed —
//     the old fact is archived, the new one is memorized with its source
// → { verdict: 'unknown' }      : channel unavailable → nothing is touched

await verifier.sweep();   // "curator" mode: sweep and re-verify every expired fact
```

A failing channel yields `unknown`, never `contradicted`: **unavailability is not a
contradiction**.

## Temporal archiving: nothing is lost

When a fact is contradicted (or manually retracted via `kb.retract`), it stops being served —
but it is **never erased**. It moves to history with its **validity period**:

```ts
kb.historyOf('marcella');
// → [{ s: 'marcella', p: 'works_at', o: 'acme',
//      from: 1717000000000, to: 1760000000000, reason: 'contradicted by re-verification' }]
```

"Marcella works at Acme" becomes "**true from June 2024 to June 2026**". Memory knows the
history of its own facts — invaluable wherever historization matters (healthcare, legal,
finance, compliance).

### Querying the past: `factAsOf` / `valueAsOf`

Editing a value (`kb.editFact(s, p, oldO, newO)`) **archives the old one** (with its period) and
writes the new — so every successive version is kept. You can then query any **instant**:

```ts
kb.valueAsOf('paris', 'mayor', tIn2020);      // → ['x']  (what was true at that date)
kb.ask('paris', 'mayor');                      // → ['y']  (today's truth)

kb.factAsOf('paris', 'mayor', tIn2020);
// → { asOf: ['x'], current: ['y'], changed: true }
```

`valueAsOf` combines the **current** value (if it was already true at `at`) with the **archive**
(facts whose `[from, to)` contains `at`). `factAsOf` adds the **current** value and a `changed` flag —
enough to answer "back then it was **X** (but today it's **Y**)" without ever rewriting history.

## Flags: epistemic status and salience

Beyond provenance, every fact carries two ORTHOGONAL axes, set by a human (never
automatically) — every fact is born *open + minor*:

| Flag | Meaning | Mechanical effects |
|------|---------|--------------------|
| **⭐ major** | LOAD-BEARING fact (salience) | guaranteed into the answer context window · prioritized in proactive alerts and migration |
| **🔒 closed** | DECIDED fact (epistemic status) | leaves the re-verification loop · confidence floor in reasoning chains · **wins by default** against a contestation (recorded and traced, but the decision is only overturned by reopening the fact) |
| **🔑 secret** | CONFIDENTIAL fact | hidden from normal reads (`allFacts`, RAG, admin view); encrypted value; reachable only via authenticated access — see [Access layer](access-layer) |

A fact's default state is **open** (revisable) and **minor** (peripheral); major, closed and
secret are explicit decisions. Closing a fact is an **act of curation**: it is what separates a
team memory (decisions hold) from a whiteboard anyone can scribble over.

## Linking facts and rules

A fact is not always entered by hand: it can be **derived** by a rule. When the rule engine
applies `X parent_of Y ; Y parent_of Z => X grandparent_of Z`, the produced fact
`(alice, grandparent_of, carl)` is written with an **inference source** pointing to its rule:

```
source: { kind: 'inference', ref: 'rule:grandparent' }
```

This link makes the inference chain **navigable both ways**:

- **from a fact to its rule**: the derived fact's provenance names the rule that produced it;
- **from a rule to its facts**: you recover every derived fact by filtering on the
  `rule:<name>` source.

The same holds for other derivations — **relation generalization** ("mère_de" derives
"parent_de", source `taxonomy:mère_de`) and **induced rules** (origin `induced`). A fact thus
always knows *why* it exists: entered, imported, deduced by a given rule, generalized from a
given relation. Knowledge and reasoning stay woven together, and auditable.

## Why it's different

| Problem | QPath's answer |
| --- | --- |
| "Where does this answer come from?" | Every fact traces back to its source (who, when, which reference) |
| "That was true last year…" | Freshness per origin + re-verification through the original channel |
| "The model forgot / overwrote it" | Nothing is erased: temporal archive, validity periods |
| "Who is allowed to write?" | Audit by source: purge/review everything that came through one channel |

> Internal mechanisms (representation, indexing) are not published — access on request.
