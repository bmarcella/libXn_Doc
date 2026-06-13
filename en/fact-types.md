# Fact types

There is **one fundamental type**: the **fact = triplet `(subject, predicate, object)`**. On top, two
axes enrich it — a **flag** (its role) and a **provenance** (its origin) — plus a few **special facts**
(reasoning semantics) and **computations** on numeric objects.

## Create & manipulate: the `kb.fact(...)` handle

One interface, chainable, **by triplet or by id** — no need to re-pass the triplet.

```ts
// CREATE: fact + provenance + flags IN ONE CALL
const f = await kb.fact('alice', 'likes', 'coffee')
  .from({ kind: 'user' })   // provenance
  .closed().major()         // flags
  .save();                  // writes everything
f.id;                       // 'f…' — deterministic identifier

// MANIPULATE BY ID (no triplet re-passing)
kb.fact(f.id).setFlags({ major: false });
kb.fact(f.id).flags();      // { closed: true }
kb.fact(f.id).sources();    // the provenance
kb.fact(f.id).retract('stale');

kb.tripletOf(f.id);         // { s, p, o } of an id
```

> Simplest: `await kb.tell('alice', 'likes', 'coffee')` still works for a bare fact. `kb.fact()` is
> the unified version when you want provenance, flags, or the id back.

## "Flag" axis — the role of the fact

Set via the handle (`.closed()/.major()/.group()`) or `kb.setFlags(...)`. Read via `kb.fact(id).flags()`.

| Flag | For | Set by |
|---|---|---|
| *(none)* | ordinary fact | by default |
| **`closed` 🔒** | **decided**: leaves re-verification, wins a challenge | `.closed()` |
| **`major` ⭐** | **structuring**: prioritized in RAG / alerts | `.major()` |
| **`secret` 🔑** | **confidential**: encrypted at rest, hidden from normal reads | [`FactVault.setSecret`](/en/access-layer) |
| **`group`** | attached to an **access group** (permissions) | `.group('finance')` / [`FactAccessControl`](/en/access-layer) |
| **`companionOf`** | **companion fact** of an owner (profile) | [`CompanionFacts.attach`](/en/components) |

## "Provenance" axis — the origin of the fact

The 4th argument (`source`) — for **traceability** and **freshness** (re-verification).

```ts
await kb.fact('alice', 'city', 'paris').from({ kind: 'document', ref: 'cv.pdf' }).save();
kb.fact(id).sources();   // [{ kind: 'document', ref: 'cv.pdf', at: … }]
```

`user` · `document` · `web` · `tool` · `llm-verified` · `inference` · `import`.

## Special facts (reasoning semantics)

| Type | For | Create | Use |
|---|---|---|---|
| **Negation** `not_p` | **deny** (proof, not an absence) | `kb.fact('penguin','not_flies','true').save()` | `kb.checkInherited(...)` → `'no'` |
| **Identity** `même_que` | two names = same entity | `kb.mergeEntities('bob','robert')` | merged reads |
| **Non-identity** `distinct_de` | "not the same John" | `kb.splitEntity(...)` | blocks a merge |
| **Class** `est` | `cat est animal` → inheritance | `kb.fact('cat','est','animal').save()` | `kb.classesOf`, `kb.askInherited` |

## Numeric objects — computations

When the object is a number (`'30'`, `'1.5'`, `'60 kg'`…), QPath can compute over it, **token-free**.

```ts
// Over the objects of a (subject, predicate):
kb.aggregate('class', 'grade', 'avg');      // mean
kb.aggregate('class', 'grade', 'median');   // median
kb.aggregate('class', 'grade', 'stddev');   // standard deviation

// Across all subjects bearing a predicate:
kb.aggregateAll('age', 'avg');              // everyone's average age

// All at once:
kb.stats('class', 'grade');
// → { count, sum, avg, min, max, median, variance, stddev, range }
```

Available functions: **`count` · `sum` · `avg` · `min` · `max` · `median` · `variance` · `stddev`
· `range`**. And to query: `kb.askNumeric('age', '>', 18)` ("who is older than 18?"),
`kb.numericValueOf(s, p)`, `kb.compareNumeric(s1, s2, p)`.

## In one sentence

One type (the triplet), two axes (**6 flags** × **7 provenances**), **4 special** reasoning facts, and
**9 computations** on numeric objects — all manipulable through a single interface, `kb.fact(...)`, by
triplet or by id.
