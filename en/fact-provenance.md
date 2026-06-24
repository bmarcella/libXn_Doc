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

**The arguments of `tell(s, p, o, source?, flags?)`** — the first three are the triplet; the last
two, optional, attach provenance and flags **in the same write**:

| Argument | Role | Default |
|---|---|---|
| `s` | the fact's **subject** | — (required) |
| `p` | the **predicate** (the relation) | — (required) |
| `o` | the **object** (the value) | — (required) |
| `source?` | the fact's origin — see the `FactSource` table below | `undefined` = no source recorded (the fact exists but has neither freshness nor a re-verification channel) |
| `flags?` | flags set **atomically** with the fact (`{ closed?, major?, secret?, group?, companionOf?, cascade? }`) — see [Flags](#flags-epistemic-status-and-salience) | `undefined` = open + minor |

The **`source`** object (`FactSource`):

| Field | Role | Default |
|---|---|---|
| `kind` | origin type — one of the values listed below | — (required when `source` is provided) |
| `ref?` | reference: URL, document id, **tool name**… (this is what `FactVerifier` reads back to find the right channel) | `undefined` |
| `at?` | epoch-ms timestamp of the record | `undefined` → the current instant at write time |
| `confidence?` | confidence carried by this source, `0`..`1` | `undefined` |
| `display?` | verbatim **display form** of the object (case/accents preserved) — the KB normalizes `o` to lowercase for search; this field keeps the original for the UI, read via `displayOf()` | `undefined` → the normalized object is shown |

Available `kind`s: `user` (stated by the user), `document` (extracted from an ingested document),
`web`, `tool`, `llm-verified` (LLM hypothesis verified then memorized), `inference` (derived by
reasoning), `import`.

> 💡 `tell` is **async** (`await`) and returns `ContradictionReport | null`: `null` in the normal
> case, otherwise a report when the incoming fact has its **exact opposite** already in store
> (`p` ↔ `not_p`, same subject, same object). Both facts stay stored — memory archives the evidence,
> the curator decides.

**`sourcesOf(s, p, o)`** takes the exact triplet and returns **an array** `FactSource[]` (a copy, in
chronological record order) — empty `[]` if the fact has no known source. Same shape as what you pass
to `tell`, augmented with the real `at`.

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

**`statusOf(s, p, o, policy?, now?)`** — derives **one** fact's freshness status from its most recent
source:

| Argument | Role | Default |
|---|---|---|
| `s`, `p`, `o` | the triplet to evaluate | — (required) |
| `policy?` | the freshness policy — `{ ttlByKind?, ttlByPredicate? }`: TTL in ms per `kind` (absent = stable), with a per-predicate override | `DEFAULT_FRESHNESS` (web 30 d, tool 7 d, llm-verified 90 d; everything else stable) |
| `now?` | reference instant in epoch ms (to test or replay a date) | `Date.now()` |

Returns `'fresh' \| 'stale' \| 'unknown'`: `'unknown'` if the fact doesn't exist or has **no source**
(pre-provenance); `'fresh'` if within its TTL (or if no TTL applies → stable); `'stale'` if the TTL is
exceeded.

**`staleFacts(policy?, now?)`** — same two optional arguments (same defaults); returns **every**
expired fact as an array `{ s, p, o, sources }[]`. **Closed** facts (🔒) are excluded: a decided fact
is never re-verified again.

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

**The constructor `new FactVerifier(kb, opts?)`**:

- **`kb`** — the `KnowledgeBase` to re-verify (required). It is the one re-stamped (`confirm`) or
  corrected (`retract` + `tell`) depending on the verdict.
- **`opts?`** — channels and settings (object, defaults to `{}`):

| Option | Role | Default |
|---|---|---|
| `tools` | a `ToolRegistry`: **built-in** channel for `kind: 'tool'` facts — calls the original tool again (by name via `ref`, otherwise by predicate) | `undefined` (no tool channel) |
| `reverifiers` | **injected** channels per source `kind` (`{ web, 'llm-verified', user, … }`), each a `Reverifier` function. **Take priority** over the `tools` channel | `undefined` (no injected channel) |
| `policy` | freshness policy used by `sweep` to collect expired facts | `DEFAULT_FRESHNESS` |
| `writeBack` | `false` = **dry-run**: compute verdicts without touching the KB | `true` (verdicts write back) |

A **`Reverifier`** is a function `(s, p, o, source) => Promise<string[] | null>`: it returns the
**current** values observed for `(s, p)`, or **`null`** if the channel can't answer (unavailable, off
topic) — that `null` is what produces the `unknown` verdict.

**`verify(s, p, o)`** takes the exact triplet of a known fact and returns `Promise<VerifyOutcome>`:
`{ s, p, o, verdict, current?, via? }` where `verdict` is `'confirmed' | 'contradicted' | 'unknown'`,
`current` the observed values (present mostly on a contradiction) and `via` the channel used
(`'tool:<ref>'` or `'reverifier:<kind>'`).

> 🔒 `verify` **never touches** a secret fact (🔑) nor a closed fact (🔒): it returns `unknown`
> outright. For a secret, the stored object is ciphertext — comparing it to a cleartext value would
> always read "contradicted" and rewrite the secret in cleartext (a leak). A closed fact is a frozen
> decision, out of scope for automatic re-verification.

**`sweep(now?)`** — `now` (epoch ms, default `Date.now()`) sets the instant at which freshness is
evaluated. Returns `Promise<SweepReport>`: `{ checked, confirmed, contradicted, unknown, outcomes }`
(the counters plus the detail of each `VerifyOutcome`).

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

**`historyOf(s?, p?)`** — both arguments are **optional filters**:

- **`s?`** — keep only archived facts of this subject; `undefined` = all subjects.
- **`p?`** — keep only this predicate; `undefined` = all predicates.

Returns an array `ArchivedFact[]` (most recent last), each entry carrying the **validity period**:
`{ s, p, o, sources, from?, to, reason? }` — `from` = first known record (epoch ms, `undefined` if
unknown), `to` = the retraction instant, `reason` = why (contradiction, expiration, edit, manual…).

**`kb.retract(s, p, o, reason?, now?)`** is what feeds this history: `reason` (free text, optional)
and `now` (epoch ms, default `Date.now()`, which becomes the archive's `to`); it returns `true` if the
fact existed, `false` otherwise. The fact stops being served **but is never erased**.

"Marcella works at Acme" becomes "**true from June 2024 to June 2026**". Memory knows the
history of its own facts — invaluable wherever historization matters (healthcare, legal,
finance, compliance). And that history is **restorable**: backed by durable storage it
**survives a restart** (see [Persistence](/en/persistence)), so "back then it was X" answers stay
available after a restart.

### Querying the past: `factAsOf` / `valueAsOf`

Editing a value (`kb.editFact(s, p, oldO, newO)`) **archives the old one** (with its period) and
writes the new — so every successive version is kept. You can then query any **instant**:

```ts
kb.valueAsOf('paris', 'mayor', tIn2020);      // → ['x']  (what was true at that date)
kb.ask('paris', 'mayor');                      // → ['y']  (today's truth)

kb.factAsOf('paris', 'mayor', tIn2020);
// → { asOf: ['x'], current: ['y'], changed: true }
```

**`editFact(s, p, oldO, newO, source?)`** — changes a fact's value:

| Argument | Role | Default |
|---|---|---|
| `s`, `p` | the targeted subject and predicate | — (required) |
| `oldO` | the **old** value (the one to archive) | — (required) |
| `newO` | the **new** value (the one to write) | — (required) |
| `source?` | provenance of the new write | `{ kind: 'user', ref: 'edit' }` |

Async, returns `Promise<boolean>`: `true` if the edit succeeded (or if `oldO === newO`, a successful
no-op); `false` if the old fact didn't exist. Under the hood it is a `retract(oldO)` followed by a
`tell(newO)` — so the old value moves to history **with its period**, which makes every successive
version queryable via the methods below.

**`valueAsOf(s, p, at)`** and **`factAsOf(s, p, at)`** take the subject, the predicate and **`at`**,
the instant to query (epoch ms) — all three required.

- **`valueAsOf`** returns an **array** `string[]`: the values valid at `at`. It combines the
  **current** value (if it was already true at `at`) with the **archive** (facts whose `[from, to)`
  contains `at`).
- **`factAsOf`** returns an **object** `{ asOf, current, changed }`: `asOf` = the result of
  `valueAsOf` (what was true at `at`), `current` = the **current** value (`ask`), `changed` = `true`
  if the two differ — enough to answer "back then it was **X** (but today it's **Y**)" without ever
  rewriting history.

> **Secrets stay masked over time.** `valueAsOf`/`factAsOf` and `historyOf` **exclude secret facts**
> by default (a retracted fact keeps its `secret` flag in the archive): querying the past never
> bypasses the Vault masking.

## Flags: epistemic status and salience

Beyond provenance, every fact carries two ORTHOGONAL axes, set by a human (never
automatically) — every fact is born *open + minor*:

| Flag | Meaning | Mechanical effects |
|------|---------|--------------------|
| **⭐ major** | LOAD-BEARING fact (salience) | guaranteed into the answer context window · prioritized in proactive alerts and migration |
| **🔒 closed** | DECIDED fact (epistemic status) | leaves the re-verification loop · confidence floor in reasoning chains · **wins by default** against a contestation (recorded and traced, but the decision is only overturned by reopening the fact) |
| **🔑 secret** | CONFIDENTIAL fact | hidden from normal reads (`allFacts`, RAG, admin view); encrypted value; reachable only via authenticated access — see [Access layer](access-layer) |

A fact can be recorded **with its flags in a single write** (atomic). This matters for a persisted
secret fact: the value is never stored durably **without** its `secret` marking — no window where the
ciphertext would be visible.

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
