# The Verbal Organ — the memory's voice

[Realization](/en/realization) gave QPath a first voice: turning a fact into a sentence. The **verbal
organ** takes that idea all the way: **one single voice** for every deterministic answer, broad
relation coverage, sentences that flow into **paragraphs** and **demonstrations**, and organs that
**learn by reading** (word gender, sentence shape). Always the same rule: **say what the memory knows,
better** — never generate at random.

> 💡 **The principle.** Every language gap becomes a **separate, learned organ**: meaning, grammar,
> morphology and identity never mix. Each organ is deterministic, auditable, and improves simply by
> **reading** — no opaque training, no invention.

> 🎯 **Use case.** An assistant that answers in real sentences (“Marie n'habite pas à Paris”, “Rex
> aime la musique”), describes an entity in a flowing paragraph, and **demonstrates** its deductions in
> plain language (“Rex est un chien, or un chien est un mammifère, donc Rex est un mammifère.”) — all
> at 0 tokens, every word traceable to a fact.

## One single voice

Every deterministic answer path goes through the **same Realization**: direct facts, lists (“Marie,
Pierre et Jean”), deductions, predictions. No more mismatched voices (a polished sentence here, a raw
triple there): form is produced in one place, with the same guarantees, and “say it differently” works
everywhere.

## Broad coverage, judged by the round-trip

The voice of each **relation** (composition, cause, comparison, ownership, capital, synonymy…) is
declared **next to the relation itself**, in the inventory — a single source of truth, ~50 relations
covered:

| Stored fact | Produced sentence |
| --- | --- |
| `(table, fait_de, bois)` | **Table se compose de bois.** |
| `(paris, capitale_de, france)` | **Paris est la capitale de France.** |
| `(fumer, cause, cancer)` | **Fumer provoque cancer.** |
| `(marie, not_habite, paris)` | **Marie n'habite pas à Paris.** |
| `(rex, aime, musique)` — learned gender | **Rex aime la musique.** |
| `(pierre, vient_de, italie)` | **Pierre vient d'Italie.** |

Every formulation is **readable back by construction**: the produced sentence, re-read by the reader,
resolves to the same canonical relation — a systematic test locks this in for every relation.
**Negation** is clean (“ne … pas”, “n'” elision), and the **object article** appears as soon as the
word's gender is known — learned, never guessed.

## Organs that learn by reading

The `@damba/libxn-language` package hosts the **learned** organs:

- **Morphology** — noun gender and number are deduced from **reading context** (seeing “la table”
  once is enough to know *table* is feminine), with a minimal seed (le/la) and a fallback on word
  form. The more the assistant reads, the more accurate its articles and pronouns.
- **Grammar judge** — **word classes** are induced on their own from the texts read (determiners
  cluster together, nouns cluster together…), and a **class-sequence** model scores how well-formed a
  sentence is. Never a word model: the judge scores **structure**, it generates nothing.

```ts
import { MorphLexicon, GrammarJudge } from '@damba/libxn-language';

const morph = new MorphLexicon();
morph.observeText('La ville est belle. Le chien dort.');
morph.genderOf('ville');   // 'f' — learned by reading

const judge = new GrammarJudge();
judge.observeText(library);               // feed by reading
judge.score('Marie vit à Paris');         // form score (null until it has read enough)
```

The judge **abstains** until it has read enough: no verdict on noise.

## Reasoning prose

A deduction no longer just states its conclusion: it **demonstrates** itself.

```
Rex est un chien, or un chien est un mammifère, donc Rex est un mammifère.
```

Every clause is a **stored fact**, every connective a **traceable inference**: this is auditable
memory speaking. The technical trace (steps, confidence) stays available alongside; the prose is the
answer.

```ts
import { realizeChainProse } from '@damba/libxn';

realizeChainProse({
  steps: [{ s: 'rex', p: 'est', o: 'chien' }, { s: 'chien', p: 'est', o: 'mammifère' }],
  conclusion: { s: 'rex', p: 'est', o: 'mammifère' },
});
// → “Rex est un chien, or un chien est un mammifère, donc Rex est un mammifère.”
```

## Discourse: describing in paragraphs

Describing an entity is no longer a list of juxtaposed sentences: the **skeleton** first (what the
thing *is*), then facts grouped by family, a **pronoun** when gender is known (never guessed), clauses
linked with “et”/“aussi”, and **varied** formulations — all attested, therefore all true.

```ts
import { realizeDescription } from '@damba/libxn';

realizeDescription('Rex', [
  { p: 'est_un', objs: ['chat'] },
  { p: 'est', objs: ['noir'] },
  { p: 'habite', objs: ['paris'] },
], { subjectGender: 'm' });
// → “Rex est un chat. Il est noir et il habite à Paris.”
```

## The internal judge: pick the best-said

The same fact can be said in several ways, **all true** (“habite / vit / réside à Paris”). The grammar
judge **ranks them from best-formed to least**: the voice serves the best one first, and “say it
differently” walks down the ranking instead of cycling blindly.

```ts
import { recombineFact } from '@damba/libxn';

recombineFact({ s: 'marie', p: 'habite', o: 'paris' }, { typer, score: (t) => judge.score(t) });
// → variants ranked by the judge — best-said first, all true
```

> ⚖️ **Why it's safe.** The judge only **chooses** among candidates already certified true by the
> round-trip. A bad score cannot make the system lie — at worst, the sentence is less elegant.

## Guarantees

| Guarantee | How |
| --- | --- |
| 0 tokens | Everything is rules + counts learned by reading; no external model call |
| 0 invention | Every sentence reads back to the facts that produced it (round-trip) |
| Deterministic | Same facts + same readings → same voice, reproducible |
| Abstention | Unknown gender → no pronoun; under-fed judge → canonical order |
