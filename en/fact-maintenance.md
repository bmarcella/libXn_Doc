# Fact hygiene — Garbage Collector & FactAdjuster

At scale (a book, thousands of messages), extraction sometimes produces imperfect facts: an unresolved
pronoun, corrupted text, a worthless fragment. QPath **maintains itself**, in the background, with two
complementary mechanisms that are **always reversible**.

> **Shared principle.** Nothing is ever permanently deleted: a retraction is a **temporal archive**
> (the fact stays visible in history and can be restored). Facts **decided by a human**
> (locked / settled) are **never** touched. **Secret** facts (the vault) are ignored. Everything is
> **language-agnostic** (the vocabulary comes from an injectable language pack).

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
