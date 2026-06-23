# Predicate synonyms — a vocabulary that learns itself

Two people say "**resides** in Lyon", "**lives** in Lyon", "**inhabits** Lyon": it is the **same
relation**. Without help, QPath stores three different predicates → fragmented memory, unanswered
questions ("where does Marie live?" misses a fact stored under "inhabits"). The **predicate vocabulary**
unifies synonyms toward a **canonical form**. It **starts rich** (seed), **grows by itself** (usage-based
proposer), and **reads tolerantly**.

> 💡 **The idea.** A synonym is just a **fact**: `(resides, predicate_alias, inhabits)`. We **seed** them in
> bulk, the system **proposes** new ones from your data, you **confirm** with one click. No hand-maintained
> table, and it is all **deterministic** (0 tokens).

## 1. Seed the vocabulary — start rich, not empty

The built-in FR seed covers common relation predicates. Write it **once** as persisted facts;
`PredicateVocabulary.fromKb` reloads them on every startup.

```ts
import { seedPredicateAliasFacts, FR_PREDICATE_SYNONYMS, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

const n = await seedPredicateAliasFacts(kb, FR_PREDICATE_SYNONYMS);
//   → writes ~80 facts (réside→habite, bosse→travaille, adore→aime, …) ; n = number written
```

Your own dictionary (CRISCO export, Wiktionary…) loads **without code**, in the same text format
`canonical: syn1, syn2` (`#` = comment):

```ts
await seedPredicateAliasFacts(kb, `
# canonical: synonyms
dirige: gère, pilote, mène, commande
soigne: traite, guérit, ausculte
`);
```

## 2. Canonicalize at extraction

Once seeded, extraction unifies synonyms to the canonical form. The `PredicateVocabulary` plugs into the
pipeline; `canonicalPredicate` covers the messy forms an LLM may produce.

```ts
import { seedPredicateVocabulary, canonicalPredicate, runFactPipeline, FR_PREDICATE_SYNONYMS } from '@damba/libxn';

const vocab = seedPredicateVocabulary(FR_PREDICATE_SYNONYMS);

canonicalPredicate(vocab, 'réside');   // → 'habite'
canonicalPredicate(vocab, 'bosse');    // → 'travaille'

// In the extraction pipeline: triplets come out already canonicalized.
const { facts } = runFactPipeline(candidates, { kb, vocabulary: vocab });
//   "Marie réside à Lyon"  →  (marie, habite, lyon)
```

## 3. Read tolerantly

The read-side counterpart: a question asked with one synonym finds a fact stored under another, **without
rewriting the fact**.

```ts
import { askTolerant, PredicateVocabulary } from '@damba/libxn';

await kb.tell('marie', 'habite', 'lyon');

const vocab = PredicateVocabulary.fromKb(kb);
askTolerant(kb, 'marie', 'vit', { vocabulary: vocab });
//   → { objects: ['lyon'], matched: 'habite', tried: ['vit', 'habite', 'réside', …] }
```

## 4. Propose from usage — the self-growth

The seed only knows what you give it. The **proposer** derives **new** synonyms from **your facts**: two
predicates are alike if they link the same `(subject, object)` pairs, especially the same **object
vocabulary**. "surveille" and "garde" both take places → proposed; "aime" takes drinks → **not** proposed
as a synonym of "habite".

```ts
import { proposeSynonyms, seedPredicateAliasFacts } from '@damba/libxn';

// Your facts, accumulated naturally:
await kb.tell('jean', 'surveille', 'lyon');   await kb.tell('marie', 'surveille', 'paris');
await kb.tell('jean', 'garde', 'lyon');       await kb.tell('anne', 'garde', 'paris');

const props = proposeSynonyms(kb, { minScore: 0.3 });
//   → [{ canonical: 'surveille', synonym: 'garde', score: 1, sharedObjects: ['lyon', 'paris'], agreements: 1 }]
//     (canonical = the most frequent predicate ; changes NOTHING)

// The human confirms -> we engrave the synonym (the base grows by itself):
if (props.length) {
  const p = props[0];
  await seedPredicateAliasFacts(kb, [{ canonical: p.canonical, synonyms: [p.synonym] }]);
}
```

The full loop: **propose** (from usage) → **confirm** (one click) → **write** (`predicate_alias`) →
**filtered** out of later proposals. The vocabulary grows from your real data, not from a generic
dictionary.

## 5. Detach the glued preposition

Extraction sometimes glues the preposition onto the predicate ("réside**_à**", "travaille**_a**").
`canonicalPredicate` tries the predicate as-is, **then** without its trailing preposition.

```ts
import { canonicalPredicate, stripPredicatePreposition } from '@damba/libxn';

stripPredicatePreposition('réside_à');     // → 'réside'
canonicalPredicate(vocab, 'réside_à');     // → 'habite'        (synonym + preposition)
canonicalPredicate(vocab, 'travaille_a');  // → 'travaille'     (unifies verb_prep and verb)
```

## The functions

- **`seedPredicateVocabulary(input, vocab?)` → `PredicateVocabulary`** — builds (or extends) an
  **in-memory** vocabulary from a `canonical: syn1, syn2` text or groups.
- **`seedPredicateAliasFacts(kb, input)` → `Promise<number>`** — writes synonyms as **facts**
  `(synonym, predicate_alias, canonical)` (**persisted**, reloaded by `PredicateVocabulary.fromKb`).
- **`parseSynonyms(text)` → `SynonymGroup[]`** — parses the text format (`#` = comment; without a colon,
  the first word is the canonical).
- **`proposeSynonyms(kb, opts?)` → `SynonymProposal[]`** — **proposes** synonyms derived from usage (by
  object-vocabulary overlap). Sorted by score, **changes nothing**. To be confirmed by a human.
- **`canonicalPredicate(vocab, p)` → `string`** — **tolerant** canonicalization: predicate as-is, then
  without its trailing preposition. **`stripPredicatePreposition(p)`** just detaches the preposition.
- **`askTolerant(kb, s, p, { vocabulary })` → `{ objects, matched, tried }`** — a read that tries all
  equivalent predicates until a fact is found.
- **`FR_PREDICATE_SYNONYMS`** — starter FR seed (common relation predicates).

## Use cases

- **Chat assistant** — the user states "Paul bosse à l'hôpital", asks "where does Paul work?": both meet
  through the canonical `travaille`, **without** the user knowing the exact predicate.
- **Document ingestion** — one report uses "resides", another "domiciled at", a third "inhabits": all
  converge to `habite`, hence a **single** queryable entry per entity.
- **Scaling up** — instead of hand-writing a synonym table, you **seed** a dictionary and let the
  **proposer** suggest the rest from the real corpus.
- **Multilingual** — synonymy is carried by **facts** (`predicate_alias`), scoped by ring like everything
  else: one pack per language, no code change.

> ⚠️ Synonymy is **scoped to relation predicates** (low ambiguity). We deliberately avoid synonymy of
> **all** words ("voler" = to steal **or** to fly) to prevent over-merging.

## Going further

- [Fact extraction](/en/fact-extraction) — the text → triplets chain where the vocabulary plugs in.
- [Fact hygiene](/en/fact-maintenance) — GC & adjuster, the other side of quality.
- [Fact types](/en/fact-types) — flags, `predicate_alias` and the other meta-facts.
