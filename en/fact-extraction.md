# Fact extraction — from prose to triples

You speak, you paste a document: QPath pulls out **facts** `(subject, predicate, object)` — **without
an LLM** by default, **deterministically**. The chain runs from raw text to memory, through a
**quality** step (normalization, dedup, entity resolution).

> 💡 **The idea.** Extraction is a **series of pure steps**: split prose into candidates, reconcile
> them (the same fact seen twice = more confidence), normalize, and keep only what makes sense. An LLM
> can additionally **vote**, but is never required.

## The chain in practice

```ts
import { extractGrammar, runFactPipeline, ingestSmart, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

// 1) Grammatical extraction (0 tokens) — multi-clause, subject ellipsis, coreference.
const candidates = extractGrammar('Marie loves cats and hates dogs. She lives in Paris.');
//    → [{ s:'marie', p:'loves', o:'cats' }, { s:'marie', p:'hates', o:'dogs' },
//       { s:'marie', p:'lives_in', o:'paris' }]   ← "She" resolved to "marie"

// 2) Pipeline — reconcile, normalize, resolve entities, type, score, drop noise.
const { facts, dropped } = runFactPipeline(candidates, { kb });

// 3) Smart write — quality + document section + uniqueness, in one call.
await ingestSmart(kb, candidates);
kb.ask('marie', 'lives_in');   // → ['paris']
```

### The functions

- **`extractGrammar(text, opts?)` → `RawCandidate[]`** — deterministic extraction: multi-clause split,
  carries the subject across clauses, resolves pronouns ("She" → last subject), spots spatial/causal
  relations. `opts.lexicon` injects a language; `opts.self` enables first person.
- **`NaturalParser.parse(text, opts?)` → `ParsedInput`** — single-clause variant: returns `{ kind, s, p, o }`
  where `kind` separates **statement** / **question** (`what`, `yesno`) — a **question stores nothing**.
- **`runFactPipeline(candidates, ctx?)` → `{ facts, dropped }`** — quality control: merges duplicates
  (confidence by agreement), canonicalizes via `ctx.aliases`/`ctx.kb` (`same_as` facts), types facts,
  and returns **motivated rejections** (`dropped[i].reason`).
- **`ingestSmart(kb, candidates, opts?)` → `Promise<…>`** — runs the pipeline **then writes**:
  normalizes, flags ⭐ class facts, groups into a document section, enforces uniqueness.

## Many languages — an injectable lexicon

Every extractor reads a **`LanguagePack`** (copulas, conjunctions, negators, pronouns, prepositions…).
`DEFAULT_LEXICON` merges FR + EN; derive a custom one:

```ts
import { makeLexicon, DEFAULT_LEXICON, extractGrammar } from '@damba/libxn';

const techLex = makeLexicon({
  id: 'tech',
  verbForms: { ...DEFAULT_LEXICON.verbForms, 'deploys': 'deploy', 'logs': 'log' },
});
extractGrammar('Alice deploys the service', { lexicon: techLex });   // domain verb recognized
```

- **`makeLexicon(overrides)` → `LanguagePack`** — merges your markers into the default (new language or
  domain vocabulary), without touching the parsers.

## Understanding the nature of a statement

Before writing, `classifyNotion` sorts a statement into its **notion** (statement / causal / spatial /
temporal) and **aspects** (negation, secret, rectification) — to route it to the right representation:

```ts
import { classifyNotion } from '@damba/libxn';

classifyNotion('my password is abc123');       // → { secret: true, … }         → Vault
classifyNotion('no, I meant Lyon');            // → { rectification: true, … }  → correction
classifyNotion('yesterday, Jean was in Paris'); // → { temporal: { dayOffset: -1 }, … }
```

- **`classifyNotion(text, lex?)` → `NotionAnalysis`** — deterministic, 0 tokens: a **secret** goes to
  the vault, a **time** sets the fact's validity, a **rectification** corrects instead of adding.

## Large document — the two-pass plan

For a book or a case file, read **the whole document first** to derive a **plan** (salient entities,
vocabulary, classes, homonyms), which then serves as context for fine-grained extraction:

```ts
import { buildDocumentPlan } from '@damba/libxn';

const plan = await buildDocumentPlan(chunks);   // chunks = document paragraphs
plan.entities;   // [{ name:'jean', mentions:2, classes:['baker'] }, …]  sorted by salience
plan.homonyms;   // [{ name:'jean', classes:['baker','astronaut'] }]     ambiguities to resolve
```

- **`buildDocumentPlan(chunks, opts?)` → `Promise<DocumentPlan>`** — pass 1: returns a `tempKb`
  (throwaway KB), the sorted **entities**, the predicate **vocabulary**, the **classes** and the
  **homonyms** — enough to run pass 2 **coherently across the document**.

## Use cases

| Situation | What extraction brings |
|---|---|
| Turn a report / interview into queryable facts | `extractGrammar` → `runFactPipeline` → `ingestSmart` |
| Handle an FR + EN corpus or domain jargon | `makeLexicon` (injectable lexicon) |
| Sort secrets / corrections / dates before writing | `classifyNotion` (notions & aspects) |
| Ingest a book keeping coherence (same entities, homonyms) | `buildDocumentPlan` (two-pass plan) |

> ✅ **Optional LLM fallback.** Candidates from an LLM extractor mix with grammar candidates in the
> **same** `runFactPipeline`: agreement between the two **boosts confidence**, and final quality stays
> guaranteed by the pipeline — deterministic.
