# Fact types

There is **one fundamental type**: the **fact = triplet `(subject, predicate, object)`**. On top, two
axes enrich it — a **flag** (its role) and a **provenance** (its origin) — plus a few **special facts**
(reasoning semantics) and **computations** on numeric objects.

> 🎯 **Use case.** Not all facts are equal. "The contract is signed" is a settled **decision**; "estimated
> salary 45k" is an **estimate**; a password is a **secret**. Flags and provenance let you treat each
> differently: a decision won't be overwritten, a secret stays out of reasoning, an estimate yields to a
> real fact. The problem it solves: carry a fact's **status** and **origin**, not just its value.

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

**The calls in detail.** The handle has **two ways to designate a fact**: by triplet
(`kb.fact(s, p, o)`) when creating, or by id (`kb.fact(id)`) once it exists.

- `kb.fact(s, p, o)` / `kb.fact(id)` — opens the handle. The **3-argument** form targets a triplet
  (subject, predicate, object) — all required and cast to strings. The **1-argument** form takes the
  **deterministic id** of an already-known fact and throws if the id is unknown. Returns: a chainable
  `FactRef` (nothing is written until `.save()` is called).
- `.from(source)` — attaches the **provenance** of the upcoming write. `source` is a `FactSource` object
  (see the "provenance" axis below); only `kind` is required.
- `.closed(v?)` / `.major(v?)` — set a flag. The boolean argument is **optional and defaults to `true`**;
  pass `false` to clear the flag (e.g. `.major(false)`).
- `.lockSubject(v?)` / `.lockObject(v?)` — **side locks** (see "4 lock states" below). `.lockSubject()`
  freezes the **subject** (the *who*; the object stays editable); `.lockObject()` freezes the **object**
  (the *value*; the subject stays editable). Boolean argument **optional, defaults to `true`**.
- `.lock(state)` — set the named state at once. `state` is `'open' | 'subject_locked' | 'object_locked' | 'closed'`
  (type `FactLock`) — it **replaces** the three lock flags coherently.
- `.group(g)` — attaches the fact to the access group named `g` (required string).
- `.save()` — writes the triplet **+** its provenance **+** its pending flags in a single call. It is
  `async` (persistence may be remote): `await` it. Returns: the same `FactRef` (chainable); `f.id` is then
  the deterministic identifier.

| Handle method (by id) | Argument | Role | Returns |
|---|---|---|---|
| `.setFlags(flags)` | partial `FactFlags` object (`{ closed?, major?, secret?, group?, … }`) — **merged** with the existing ones | sets/changes flags **immediately** (without re-writing the triplet) | the handle |
| `.flags()` | *(none)* | reads the current flags | `FactFlags` (`{}` if none) |
| `.sources()` | *(none)* | reads the provenance | `FactSource[]` |
| `.retract(reason?)` | optional reason (string, archived) | retracts the fact (archived, **never** erased) | `boolean` — `true` if it existed |
| `kb.tripletOf(id)` | the deterministic id | recovers the triplet of an id | `{ s, p, o }` or `undefined` if the id is unknown |

> 💡 `.save()` is **async**, but `.setFlags()` / `.flags()` / `.sources()` / `.retract()` are
> **synchronous** (they operate on the in-memory index). Only `await` `.save()` (and `kb.tell`).

> Simplest: `await kb.tell('alice', 'likes', 'coffee')` still works for a bare fact. `kb.fact()` is
> the unified version when you want provenance, flags, or the id back. Full signature:
> `kb.tell(s, p, o, source?, flags?)` — the 4th/5th arguments (provenance, flags) are optional, and
> `tell` returns a `Promise<ContradictionReport | null>` (non-`null` if the exact opposite `p ↔ not_p`
> already exists).

## "Flag" axis — the role of the fact

Set via the handle (`.closed()/.major()/.group()`) or `kb.setFlags(...)`. Read via `kb.fact(id).flags()`.

| Flag | For | Set by |
|---|---|---|
| *(none)* | ordinary fact | by default |
| **`closed` 🔒** | **decided**: leaves re-verification, wins a challenge (= both sides frozen) | `.closed()` |
| **`leftClosed`** | **subject frozen**: the *who* can't be replaced (object editable) | `.lockSubject()` |
| **`rightClosed`** | **object frozen**: the *value* can't be replaced (subject editable) | `.lockObject()` |
| **`major` ⭐** | **structuring**: prioritized in RAG / alerts | `.major()` |

### The 4 lock states (`FactLock`)

A fact *(subject, predicate, object)* can **freeze each side independently**. The side flags derive
a named state, read with `kb.lockOf(s, p, o)` and set with `kb.setLock(s, p, o, state)`:

| State (`FactLock`) | Subject | Object | Meaning |
|---|---|---|---|
| `open` | editable | editable | default — nothing frozen |
| `object_locked` | **editable** | frozen | the *value* is engraved, the subject can change |
| `subject_locked` | frozen | **editable** | the *who* is engraved, the object can be updated |
| `closed` 🔒 | frozen | frozen | decided — equals `leftClosed ∧ rightClosed` |

These locks govern **overriding under a uniqueness constraint** (see below): freezing a side forces
**rejection** of any write that would change *that* side, **per direction** — `object_locked` blocks
replacing the value (`leftUnique`) but allows reassigning the subject (`rightUnique`), and vice versa.
`closed` remains the "decided" backward-compatible shorthand (both at once).
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

The `source` object passed to `.from(...)` (type `FactSource`):

| Field | Role | Default |
|---|---|---|
| `kind` | **required** — the nature of the origin (see the list below) | — |
| `ref?` | free-form reference: URL, document id, tool name… | — (none) |
| `at?` | epoch timestamp (ms) of the record | **now** (`Date.now()`) if omitted |
| `confidence?` | confidence carried by this source, between `0` and `1` | — (unweighted) |
| `display?` | **verbatim display** form of the object (case/accents preserved) — the stored object is lowercased, this field keeps the original for the UI | — |

> 💡 Multiple `.save()`/`tell` of the same triplet **do not overwrite** the provenance: they **stack**
> the sources. So `kb.fact(id).sources()` returns an array (each entry carries its own `at`).

Possible `kind` values: `user` · `document` · `web` · `tool` · `llm-verified` · `inference` · `import`.

## Special facts (reasoning semantics)

| Type | For | Create | Use |
|---|---|---|---|
| **Negation** `not_p` | **deny** (proof, not an absence) | `kb.fact('penguin','not_flies','true').save()` | `kb.checkInherited(...)` → `'no'` |
| **Identity** `same_as` | two names = same entity | `kb.mergeEntities('bob','robert')` | merged reads |
| **Non-identity** `distinct_from` | "not the same John" | `kb.splitEntity(...)` | blocks a merge |
| **Class** `est` | `cat est animal` → inheritance | `kb.fact('cat','est','animal').save()` | `kb.classesOf`, `kb.askInherited` |

**The operations in this table, in detail:**

- `kb.mergeEntities(a, b, source?)` — declares that two names refer to the **same** entity. `a` and `b`
  are the two subjects (required strings); `source` is an optional `FactSource` provenance (default:
  `{ kind: 'user', ref: 'fusion' }`). Returns: `Promise<boolean>` — `false` if the merge is **refused**
  (same names, or a non-identity `distinct_from` already exists between them), `true` otherwise.
- `kb.splitEntity(from, factsToMove, opts?)` — splits one entity into two ("not the same John"). `from`
  is the original subject; `factsToMove` is the **list of facts to move** to the new entity, each
  `{ p, o }` (the subject is implicitly `from`); `opts` is optional — `{ discriminantNew?, discriminantOld? }`
  sets a readable label on each entity. Returns: `Promise<string>` — the **id of the new subject**
  created. The moved facts are retracted on the `from` side (archived, not erased) and a `distinct_from` is
  set in **both** directions.
- `kb.checkInherited(s, p, o, maxDepth?)` — checks a triplet **with inheritance and exceptions**. The
  first three arguments are the triplet to test; `maxDepth` bounds the inheritance walk (default **6**).
  Returns: `{ verdict: 'yes' | 'no' | 'unknown'; answer? }` — `'yes'` (asserted, direct or inherited),
  `'no'` (**denied** by a `not_p` — a proof, not an absence), `'unknown'` (undecidable).
- `kb.classesOf(s, maxDepth?)` / `kb.askInherited(s, p, maxDepth?)` — walk the class chain (`est`);
  `maxDepth` bounds the depth (default **6**).

> ⚠️ To **change** a single-valued class fact, `retract` then `tell`: a plain second `tell` **adds** a
> value instead of replacing the previous one.

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

A **comparator** is the `{ op, value }` object accepted instead of a string in `s`, `p` or `o`:

- `op` — the operator: `=` · `!=` · `<` · `<=` · `>` · `>=` (on the **numeric** value of the field) ·
  `like` (substring, case-insensitive) · `in` (membership in a list).
- `value` — the comparison value. A **string or number** for most operators; an **array**
  (`['alice', 'bob']`) for `in`. For `<` `<=` `>` `>=`, the field value is parsed as a number — a
  non-numeric field never matches.

> 💡 A **bare string** (`{ p: 'age' }`) is shorthand for **exact equality** (`{ op: '=' }`); a
> **missing** field is a **wildcard** (all). So `{ s?, p?, o? }` reads as "these constraints, the rest
> free".

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

**The three entry points, in detail:**

- `kb.compute(filter, fn)` — applies **one** aggregate function to the numeric objects of the filtered
  facts. `filter` is a `{ s?, p?, o? }` (each missing field = wildcard); `fn` is one of the 9 functions
  below. Returns: `number | undefined` (**`undefined`** if no numeric fact matches). Special case:
  `'count'` counts the **facts** (not only the numeric ones).
- `kb.stats(filter)` — computes **all** statistics at once with the same filter. A single argument (the
  filter). Returns: an object `{ count, sum, avg, min, max, median, variance, stddev, range }`, or
  **`undefined`** if no numeric object matches.
- `kb.matchFacts(filter)` — the **raw selection**: returns the matching facts as `Array<{ s, p, o }>`
  (empty array if none). It is the base of `compute`/`stats` and the text functions.

> ⚠️ `compute`/`stats`/text functions **exclude** the engine vocabulary by default (`excludeReserved`
> implicitly `true`). **Raw** `matchFacts` stays **inclusive** unless you pass `excludeReserved: true`
> in the filter.

> **Engine vocabulary excluded by default.** Computations and text functions **skip** facts whose
> predicate is internal (`same_as`, `distinct_from`, `not_*`, `est`/`est_un`/`is`) — `compute({ s: 'bob' })`
> does not count the `same_as` facts created by a merge. To include them: `{ …, excludeReserved: false }`.
> Direct check: `KnowledgeBase.isReservedPredicate('same_as') // true`.

Functions (possible values of `fn`): **`count` · `sum` · `avg` · `min` · `max` · `median` · `variance` ·
`stddev` · `range`** (variance/stddev are **population** ones).

**Shortcuts and numeric queries, in detail:**

- `kb.aggregate(s, p, fn)` — = `compute({ s, p }, fn)`. Aggregates the objects of a (subject, predicate)
  pair. Returns: `number | undefined`.
- `kb.aggregateAll(p, fn)` — = `compute({ p }, fn)`. Aggregates across all subjects bearing the predicate
  `p`. Returns: `number | undefined`.
- `kb.askNumeric(p, op, value, value2?)` — "which subjects satisfy (p) `op` value?". `op` is a numeric
  operator (`>` `>=` `<` `<=` `=` `!=` `between`); `value2` is required **only** for `between`
  (inclusive). Returns: `NumericMatch[]` = `Array<{ subject, value }>`, **sorted by ascending value**.
- `kb.numericValueOf(s, p)` — the **first** numeric value of (s, p). Returns: `number | undefined`
  (`undefined` if no object is numeric).
- `kb.compareNumeric(s1, s2, p)` — compares two subjects on a numeric predicate. Returns: the **sign**
  of (v1 − v2) — `-1`, `0` or `1` — or `undefined` if either is missing.

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

All take the **same** `filter` `{ s?, p?, o? }` as `compute`/`stats` (first argument). The two that have
a **second** argument:

- `concat(filter, sep?)` — `sep` is the separator, **`', '` by default**; pass `' | '` to change it.
- `matchCount(filter, substring)` — `substring` (**required** string) is the pattern searched in the
  objects; the comparison is **case-insensitive**.

> 💡 `mode` / `longest` / `shortest` return `undefined` if the selection is empty; `distinctValues`
> returns `[]` and `frequencies` returns `{}`.

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

`kb.defineSymbols(spec)` takes **one** argument, an object with three **all-optional** keys —
`{ subjects?, predicates?, objects? }` — each an array of `DeveloperSymbol`:

| `DeveloperSymbol` field | Role | Default |
|---|---|---|
| `name` | **required** — the claimed token (normalized) | — |
| `description?` | free-form label (docs/introspection) | — |
| `validate?(ctx)` | synchronous **veto** before write | — (no veto) |
| `onWrite?(ctx)` | **side effect** after write | — (none) |

The call is **idempotent and cumulative**: re-registering the same `name` overwrites the previous one,
and successive calls add up. Returns: `void`.

| Hook | When | Role |
|---|---|---|
| `validate(ctx)` | **before** write | `true` accepts; `false` or a reason (`string`) **rejects** (throws `SymbolValidationError`) |
| `onWrite(ctx)` | **after** write | side effect: derive a fact, audit, index… |

`ctx = { role, token, s, p, o, source, kb }`. Introspection: `kb.symbolOf(role, token)`,
`kb.isDeveloperSymbol(role, token)`.

> No silent triplet rewrite (it would break persistence): to **normalize**, reject non-conforming
> input, or derive the corrected form in `onWrite`.

## Unique facts — uniqueness constraints

By default a `(subject, predicate)` is **multi-valued**: `alice likes tea` then `alice likes coffee`
coexist. But some predicates are **functional**: an email has one id, a person one birth date. You can
**declare a uniqueness constraint** on a predicate; it is then checked on **every write**, before the
fact is stored.

```ts
kb.declareUnique('has_name',  'leftUnique');                          // 1 object per subject
kb.declareUnique('has_email', 'rightUnique');                        // 1 subject per object
kb.declareUnique('has_id',    'fullUnique');                         // bijection (both)
kb.declareUnique('status',    'leftUnique', { onConflict: 'replace' }); // latest wins
```

The **three forms** of uniqueness (depending on what acts as the key):

| `kind` | Key | Guarantees | Example |
|---|---|---|---|
| `leftUnique` | the **subject** | `(s, p)` has only **one** object (*functional*) | `b@gmail.com has_name Jean` — one email → one name |
| `rightUnique` | the **object** | `(p, o)` has only **one** subject (*inverse-functional*, ≈ DB `UNIQUE`) | `Jean has_email b@gmail.com` — an email belongs to one person |
| `fullUnique` | **both** | functional **and** inverse-functional (*bijection / key*) | `b@gmail.com has_id 1234` — one email ↔ one id |

`kb.declareUnique(predicate, kind, opts?)` takes:

| Argument | Role | Default |
|---|---|---|
| `predicate` | the constrained predicate (normalized) | — |
| `kind` | `'leftUnique'` \| `'rightUnique'` \| `'fullUnique'` | — |
| `opts.onConflict?` | what to do if a **different** value already exists (see below) | `'reject'` |

**Conflict policy** (`onConflict`) — triggered only when a **different** value conflicts:

| Policy | Effect |
|---|---|
| `reject` (default) | refuses the write: `tell` **throws `UniquenessError`**, the existing value is kept. Nothing is lost. |
| `replace` | archives the conflicting old value(s) (retracted → [history](/en/fact-provenance)) then writes the new one. |
| `report` | writes anyway and **returns a `UniquenessReport`** (`tell` → `{ kind: 'uniqueness', conflicts: [...] }`) for you to decide. |

```ts
kb.declareUnique('has_email', 'rightUnique');           // default: reject
await kb.tell('alice', 'has_email', 'a@x.com');         // ✅
await kb.tell('bob',   'has_email', 'a@x.com');         // ❌ UniquenessError (email already taken)
await kb.tell('alice', 'has_email', 'a@x.com');         // ✅ idempotent — same fact, not a conflict
```

Keep in mind:

- **Idempotence**: re-asserting the **same** triplet is never a conflict (it just adds a source).
- **A locked side wins**: if the existing fact is frozen **in the modified direction** (🔒 `closed`, or the matching side lock — `object_locked` for `leftUnique`, `subject_locked` for `rightUnique`), the competing write is **rejected**, even under `replace`.
- **Backward-compatible**: without `declareUnique`, the predicate stays multi-valued (nothing changes).
- **`tell` now returns** either a negation contradiction or a uniqueness violation — told apart by `report.kind` (`'negation'` vs `'uniqueness'`).
- **Declare at startup** (like `defineSymbols`); for **cross-tenant global** uniqueness, the `unique` index on the [persistence](/en/persistence) side handles it (the two compose).

### Scope & governance — who owns which key

A constraint carries a **tier** (`declareUnique(pred, kind, { tier })`), mirroring the [memory rings](/en/layers):

| Tier | Who | Scope |
|---|---|---|
| `global` | the **system**: dev (hard-coded) + platform admin | applies in **every** scope |
| `tenant` | an **org / user** (created in the UI, with label/description) | applies **only to its scope**, isolated |

Two rules follow from this split:

- **Separate namespaces**: a `tenant` declaration on a predicate already owned `global` is **ignored** — a tenant can neither redefine nor weaken a system rule (e.g. it can't remove `has_email` uniqueness). It only constrains **its own** predicates.
- **Isolation**: uniqueness is checked against **the writing scope's data only**. Two organizations can therefore hold the same value without conflict — "global" qualifies the *rule*, not the *value*.

Since orgs/users create theirs from the UI, a constraint can live **as facts** (ring-scoped, describable) rather than in code:

```ts
// Writes (predicate, cardinality, kind) [+ on_conflict, + unique_label] into the current ring:
await kb.declareUniqueAsFacts('matricule', 'fullUnique', { onConflict: 'reject', label: 'Internal staff id' });
// On hydrating a scope, translate those meta-facts into constraints (generic as 'global', org/user as 'tenant'):
kb.loadUniqueConstraints({ tier: 'tenant' });
```

## In one sentence

One type (the triplet), two axes (**6 flags** × **7 provenances**), **4 special** reasoning facts,
per-predicate **uniqueness constraints**, **9 numeric** computations and **text functions** (distinct,
frequencies, mode…) — all via a `{ s?, p?, o? }` filter, and manipulable through a single interface,
`kb.fact(...)`.
