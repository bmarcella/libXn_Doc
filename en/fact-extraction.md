# Fact extraction — from prose to triples

You speak, you paste a document: QPath pulls out **facts** `(subject, predicate, object)` — **without
an LLM** by default, **deterministically**. The chain runs from raw text to memory, through a
**quality** step (normalization, dedup, entity resolution).

> 💡 **The idea.** Extraction is a **series of pure steps**: split prose into candidates, reconcile
> them (the same fact seen twice = more confidence), normalize, and keep only what makes sense. An LLM
> can additionally **vote**, but is never required.

> 🎯 **Use case.** You paste a meeting note or a hand-written client sheet. Instead of re-typing everything
> into fields, QPath extracts clean facts ("Marie · lives_in · Paris", "Marie · works_at · Acme"),
> deduplicated and linked to the right entities, ready to be queried. The problem it solves: turn **prose**
> into **structured memory** without an LLM inventing or distorting, and without manual entry.

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

// 1) Prepare the document chunks. `file` comes from an upload (<input type="file">); read its text,
//    then split it into paragraphs. So `chunks` is a string[].
const documentText = await file.text();
const chunks = documentText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

// 2) Pass 1 — build the plan from those chunks.
const plan = await buildDocumentPlan(chunks);
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

## Two shapes the copula cannot read

The grammar reads "X is Y" and prepositional complements. Two ordinary shapes escaped it, and they
produced **no** candidate at all: giving a name, and the relation verb.

```ts
extractGrammar("My clinic is called Dentaco.");  // → (clinic, name, Dentaco)
extractGrammar('The park includes 42 units.');   // → (park, includes, 42 units)
```

- **Naming** (`extractNaming`) — "X is called Y", "X is named Y", and the French pronominal form. The
  name keeps its case. An attribute carrying a conjugated verb is not a name: "is called whatever you
  want" yields nothing.
- **Relation verb** (`extractRelationVerb`) — the verb list is **closed**, and that is what makes this
  reader safe. Only verbs that state what **is** belong to it; a verb that reports what someone
  **does** or **believes** ("I manage", "I think") never does. The subject must be a named entity: a
  pronoun is left to the general parser, which owns coreference.

The guards are unchanged: a question writes nothing, nor does an order, nor an irrealis statement.

> 📏 **Measured, not assumed.** On a hand-annotated conversation corpus, these two readers raise the
> share of facts read from 42.6 % to 57.4 %, and the questions the memory can answer from 56 % to
> 84 % — **without adding a single false fact** (their share even drops from 11.5 % to 8.8 %, the
> denominator having grown).

## Decisions and questions left open

"What did we decide about the Laval file?" is exactly what people come back for three weeks later. A
decision is stated with a **verb** ("we agreed that"), not a copula: the ordinary grammar read it
very poorly. `DecisionGrammar` reads it, with no model call.

```ts
readDecisions('We decided to chase tenants 90 days before expiry.');
// → [{ kind: 'decided', text: 'chase tenants 90 days before expiry', cue: 'we decided to' }]

readDecisions('Still to decide who signs the notices.');
// → [{ kind: 'open_question', text: 'who signs the notices', cue: 'still to decide' }]
```

- **`cue` says WHY the read happened**: the recognised formula comes back with the statement. The
  read is explainable, not merely correct.
- **The formula list is closed.** A formula belongs only if it **announces** the decision or the open
  question. A statement describing an action ("we chase tenants every Monday") is not a decision: it
  is what someone does, and writing it as settled would invent an agreement nobody gave.
- **Silence is half the job.** A question asked of the assistant expects an answer next turn: it is
  not "open". An irrealis statement ("maybe we keep the eco model") settled nothing.

> 📏 **Measured on unseen sentences.** On the tuning corpus the read is complete (9 decisions of 9,
> 4 open questions of 4, 55 silences of 55) — but that figure proves little on its own, since the
> formulas were written while looking at that corpus. On sentences that did not shape them:
> **11 recognised of 11**, and **10 silences held of 10** against traps chosen to look like decisions.

## Writing without a human review: the gate

Damba normally shows the facts it understood and waits for a click. When it works in the background,
that click does not exist. `FreeFactGate` then decides not "is this fact true?" — nobody knows how to
do that — but "am I allowed to write it without a human reading it first?".

```ts
const gated = gateFreeFacts(facts, { knownSubjects: subjectsInMemory });
factsToWrite(gated);   // what gets written
factsToReview(gated);  // what waits for a human, with its reason in words
```

- **A reader measured at 100 % writes on its own.** A reader does not join the list because it looks
  safe: it joins with its number, and it leaves if the number drops.
- **The general reader only writes on an already-known subject.** Its errors land on badly segmented
  subjects, hence on subjects the memory has never seen: the condition catches them.
- **An obligation is not a state.** "Atlas must deliver in March" goes to review.
- **Strong markers are stripped.** A fact written in the background is neither a human decision nor
  the backbone of the memory: it never outranks what you typed yourself.
- **Nothing vanishes silently**: every fact gets a verdict, and a refusal states its reason in words.

> 📏 **Measured between two bounds.** On an empty memory: 8 facts written, **no false ones**, 15 % of
> what a human wanted kept. On a memory that already knows the domain — a real account: **30 written,
> no false ones, 56 %**, where having no gate let one false fact through. The truth moves toward the
> second bound as the memory fills up.
