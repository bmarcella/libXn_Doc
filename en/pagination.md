# Browsing large sets: pages and filters

A useful memory grows. Past a few thousand facts, the question is no longer "how do I read them" but
"how do I read only what I need, without ever suggesting I have seen everything".

LibXN answers with **one filter vocabulary**, used the same way on an in-memory knowledge base and on
a database of millions of rows.

## One filter, one definition

A filter targets the three terms of a fact — subject, predicate, object — and each term takes either
an exact value or a comparator:

| Operator | Meaning |
|---|---|
| `=` · `!=` | equal, different |
| `like` | contains (case-insensitive) |
| `in` | belongs to a list |
| `<` `<=` `>` `>=` | **numeric** comparison of the value |

```ts
kb.matchFacts({ p: 'city', o: 'paris' });
kb.matchFacts({ p: 'age', o: { op: '>=', value: 30 } });
kb.matchFacts({ p: 'name', o: { op: 'like', value: 'dupont' } });
```

Numeric comparators read the number **at the start** of the value: "60 kg" is 60, "1,5" is 1.5, and a
value with no number is simply excluded. That avoids the classic "10" sorting before "9" because
text was compared instead of numbers.

The same predicate is exposed on its own, to filter an already-loaded list without rewriting the rule:

```ts
matchesValue('60 kg', { op: '>=', value: 60 });   // true
```

## A page always states its total

```ts
const page = kb.matchSubjectsPage({ p: 'created_via', o: 'form:client' }, { offset: 50, limit: 25 });
// { items: [...25], total: 1240, offset: 50, limit: 25, hasMore: true }
```

`total` is the count **before** slicing. Without it the caller can neither show "page 3 of 50" nor
know that it is not showing everything — and a silently truncated list reads exactly like a complete
one. That is the costliest flaw of a sloppy pagination.

## Paginate entities, not facts

An entity is worth several facts. Slicing *facts* would cut an entity in two across pages: half its
attributes on page 2, the rest on page 3.

- `matchSubjectsPage(filter, page)` — distinct **subjects**: "list my clients";
- `matchFactsPage(filter, page)` — **facts**, when facts are really the subject matter;
- `listSubjectsPage(page)` — subjects by richness, with their total.

So the pattern is two-step: paginate the subjects, then load the facts of that page's subjects only.

## The same filter, executed by the database

The functions above work on a loaded memory. When the corpus lives in PostgreSQL, the adapter
translates **the same filter** into SQL — same operators, same numeric semantics:

```ts
const q = pgFactQuery(sql);
const page = await q.subjects({
  scope: 'user',
  filter: { p: 'created_via', o: 'form:client' },
  limit: 25, offset: 50,
});
const facts = await q.factsOfSubjects(page.items, { scope: 'user' });
```

The total comes from a windowed count in the **same** query: a separate count could see a different
state of the table and report a wrong number of pages. Search wildcards (`%`, `_`) are escaped —
otherwise a search for "100%" would return everything.

One thing to know: alphabetical order comes from the database collation, while in memory it comes
from `localeCompare`. With accents or mixed case the two can differ by one position. Numeric sorting
is aligned on both sides.

## What this prevents

A screen that loads everything works fine until the day it doesn't — and it fails badly: it shows a
plausible but incomplete list without saying so. A page carrying its total turns that silent failure
into information — "1240 items, 25 shown" — that the screen can display and the user can understand.
