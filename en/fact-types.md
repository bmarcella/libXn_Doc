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
| **`cascade`** | the companion **follows the retraction** of its owner | [`CompanionFacts.attach`](/en/components)`({ cascade: true })` |

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
You **target** the facts you want with a **filter `{ s?, p?, o? }`** (each missing field = wildcard),
then compute.

### Comparators (on subject, predicate, object)

Each field accepts either a **string** (equality) or a **comparator** `{ op, value }`:
`=` · `!=` · `<` · `<=` · `>` · `>=` (on the numeric value) · `like` (substring) · `in` (list).

```ts
kb.compute({ p: 'age', o: { op: '>', value: 18 } }, 'count');        // how many adults
kb.compute({ p: 'age', o: { op: '>=', value: 25 } }, 'avg');          // mean age of the ≥ 25
kb.matchFacts({ s: { op: 'in', value: ['alice', 'bob'] } });          // facts of alice OR bob
kb.compute({ p: 'email', o: { op: 'like', value: '@gmail' } }, 'count'); // gmail emails
kb.matchFacts({ p: 'price', o: { op: '!=', value: '0' } });          // non-zero prices
```


```ts
// compute(filter, function) — the entry point
kb.compute({ p: 'age' }, 'avg');                  // mean age of EVERYONE
kb.compute({ s: 'class', p: 'grade' }, 'median'); // median grade of a class
kb.compute({ s: 'alice' }, 'sum');                // sum of all of alice's numeric objects
kb.compute({ p: 'price', o: '100' }, 'count');    // how many prices equal 100

// All stats at once, with the same filter:
kb.stats({ p: 'age' });
// → { count, sum, avg, min, max, median, variance, stddev, range }

// The raw selection (matching facts):
kb.matchFacts({ p: 'age', o: '40' });             // [{ s, p, o }, …]
```

> **Engine vocabulary excluded by default.** Computations and text functions **skip** facts whose
> predicate is internal (`même_que`, `distinct_de`, `not_*`, `est`/`est_un`/`is`) — `compute({ s: 'bob' })`
> does not count the `même_que` facts created by a merge. To include them: `{ …, excludeReserved: false }`.
> Direct check: `KnowledgeBase.isReservedPredicate('même_que') // true`.

Functions: **`count` · `sum` · `avg` · `min` · `max` · `median` · `variance` · `stddev` · `range`**.
Shortcuts: `kb.aggregate(s, p, fn)` = `compute({ s, p }, fn)` · `kb.aggregateAll(p, fn)` =
`compute({ p }, fn)`. And to query: `kb.askNumeric('age', '>', 18)` ("who is older than 18?"),
`kb.numericValueOf(s, p)`, `kb.compareNumeric(s1, s2, p)`.

## Alphanumeric objects — text functions

When the object is **text**, the same `{ s?, p?, o? }` filter gives suitable functions.

```ts
kb.distinctValues({ p: 'city' });          // unique values, sorted → ['lyon', 'paris']
kb.frequencies({ p: 'city' });             // histogram → { paris: 2, lyon: 1 }
kb.mode({ p: 'city' });                     // most frequent → 'paris'
kb.longest({ p: 'name' });                  // longest object
kb.shortest({ p: 'name' });                 // shortest
kb.concat({ s: 'alice', p: 'likes' }, ' | '); // 'coffee | tea | reading'
kb.matchCount({ p: 'email' }, '@gmail');    // how many objects contain a substring
```

| Function | Returns | For |
|---|---|---|
| `distinctValues(filter)` | `string[]` | unique values (sorted) |
| `frequencies(filter)` | `Record<string, number>` | a **histogram** (value → count) |
| `mode(filter)` | `string` | the most frequent value |
| `concat(filter, sep?)` | `string` | join the objects |
| `longest` / `shortest(filter)` | `string` | by string length |
| `matchCount(filter, substring)` | `number` | how many contain a pattern (case-insensitive) |

## Developer symbols — react on write

You can **"claim" a token** (subject, predicate or object) and wire logic that fires **on write** —
no reserved namespace, nothing else in the base to touch.

```ts
kb.defineSymbols({
  predicates: [{
    name: 'balance',
    validate: (c) => /^\d+$/.test(c.o) || 'balance must be a number',  // VETO before write
  }],
  subjects: [{
    name: 'order',
    onWrite: (c) => { void c.kb.tell(c.s, 'status', 'received'); },     // EFFECT after write
  }],
});

await kb.fact('account', 'balance', 'abc').save();  // ❌ SymbolValidationError — nothing stored
await kb.fact('account', 'balance', '100').save();  // ✅
```

| Hook | When | Role |
|---|---|---|
| `validate(ctx)` | **before** write | `true` accepts; `false` or a reason (`string`) **rejects** (throws `SymbolValidationError`) |
| `onWrite(ctx)` | **after** write | side effect: derive a fact, audit, index… |

`ctx = { role, token, s, p, o, source, kb }`. Introspection: `kb.symbolOf(role, token)`,
`kb.isDeveloperSymbol(role, token)`.

> No silent triplet rewrite (it would break persistence): to **normalize**, reject non-conforming
> input, or derive the corrected form in `onWrite`.

## In one sentence

One type (the triplet), two axes (**6 flags** × **7 provenances**), **4 special** reasoning facts,
**9 numeric** computations and **text functions** (distinct, frequencies, mode…) — all via a
`{ s?, p?, o? }` filter, and manipulable through a single interface, `kb.fact(...)`.
