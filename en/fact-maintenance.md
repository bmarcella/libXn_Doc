# Fact hygiene — Garbage Collector & FactAdjuster

At scale (a book, thousands of messages), extraction sometimes produces imperfect facts: an unresolved
pronoun, corrupted text, a worthless fragment. QPath **maintains itself**, in the background, with two
complementary mechanisms that are **always reversible**.

> **Shared principle.** Nothing is ever permanently deleted: a retraction is a **temporal archive**
> (the fact stays visible in history and can be restored). Facts **decided by a human**
> (locked / settled) are **never** touched. **Secret** facts (the vault) are ignored. Everything is
> **language-agnostic** (the vocabulary comes from an injectable language pack).

> 🎯 **Use case.** After ingesting a whole book, memory holds some junk: an unresolved pronoun ("he lives in
> Paris" without knowing who), a corrupted fragment, a valueless fact. QPath **repairs what's recoverable**
> and **discards the rest**, in the background, **without ever losing anything permanently** (all archived,
> reversible). The problem it solves: keep memory clean at scale with no manual cleanup and no risk of
> irreversible deletion.

## FactAdjuster — repair what is recoverable

The FactAdjuster **re-reads the source context** of a fact (the conversation turn or document passage
it came from) to **fix** an imperfect recording.

Typical case: an **unresolved pronoun subject**. "He likes coffee" may have been stored as-is for lack
of context at extraction time. By re-reading the source, the adjuster recovers the antecedent and
corrects the subject.

> **Caution first.** "He" does **not** mean "John" by default. The adjuster fixes the subject **only
> when it can DEDUCE it unambiguously** — either because a fact with the **same predicate and object**
> points to a **single subject**, or because the context contains **only one subject**. As soon as
> **several** antecedents are possible, it **leaves the fact untouched** — a fact to refine beats a
> wrong fix.

## Garbage Collector — erase what makes no sense

The collector removes **only** facts that are **incomprehensible, malformed or meaningless** — to a
human, to the LLM and to QPath alike. Deliberately **conservative**: when in doubt, it leaves the fact.

What it targets:

- an **empty** subject, predicate or object;
- a **trivial loop** (subject identical to object);
- **corrupted text** (mojibake, control characters);
- a **non-entity subject or object**: unresolved pronoun, lone determiner or copula, single-character
  fragment — nothing you could ever query;
- a **meaningless predicate**.

What it does **not** target: a merely "not ideal" but comprehensible fact stays in memory. The
**length** of a value is never a reason to delete (a long value can be perfectly legitimate).

## When and how

Both run **in the background**, **automatically**, after write actions (document ingestion, fact
validation…). The order is intentional:

1. **FactAdjuster first** — we **rescue** what is recoverable;
2. **Garbage Collector next** — we only **erase** what is genuinely worthless.

The outcome is summarized for the user, and **everything is reversible** (temporal archive). Memory
stays **dense and reliable** with no manual upkeep.

## API in practice

Both components operate on a `KnowledgeBase`. They expose a **dry-run** (`scan`, changes nothing) and
an **apply** step (`collect` / `apply`).

### Garbage Collector

```ts
import { FactGarbageCollector } from '@damba/libxn';

const gc = new FactGarbageCollector(kb);

// 1) Inspect without removing anything.
const candidates = gc.scan();
//    → [{ s, p, o, rule: 'non-entity-subject', reason: '…' }, …]

// 2) Collect: retract (archive) the junk, returns a report.
const report = gc.collect();
//    → { scanned, collected: [...], protectedSkipped }
```

Defaults are **conservative** (language-aware via the language pack). You can add domain rules — e.g.
"oversized object" (off by default, since length ≠ meaninglessness):

```ts
import { oversizedObjectRule } from '@damba/libxn';

new FactGarbageCollector(kb, { extraRules: [oversizedObjectRule(280)] }).collect();
```

### FactAdjuster

It re-reads the **source context** through a small `ContextResolver` port supplied by the host (a chat
turn, a document passage…):

```ts
import { FactAdjuster, type ContextResolver } from '@damba/libxn';

const resolver: ContextResolver = {
  contextFor: (fact) => documentTextFor(fact),   // ← the host knows where the fact came from
};

const adjuster = new FactAdjuster(kb, resolver);
adjuster.scan();          // proposed fixes (dry-run)
await adjuster.apply();   // retract the old + write the corrected one
//    → { adjusted: [{ before, after, reason }, …] }
```

### Recommended order

```ts
// 1) Repair what is recoverable, THEN 2) erase what is still worthless.
await new FactAdjuster(kb, resolver).apply();
new FactGarbageCollector(kb).collect();
```

## When to use

- **After ingesting a large document** (a book, a case file) — that's where unresolved pronouns and
  fragments appear. A background worker chains `buildDocumentPlan` → `FactAdjuster` →
  `FactGarbageCollector`, then persists: memory is clean without blocking the user.
- **As periodic upkeep** of a large memory — a regular pass keeps the base dense.
- **On demand** — an explicit action ("clean up memory") runs the same pass and reports the outcome.

> **Do not use it to** retouch *correct-but-imperfect* facts (wording, casing). The GC touches **only**
> the meaningless; the adjuster **only** what it can deduce **unambiguously**. For an arbitrary human
> correction, use regular fact editing.
