# Realization — turning facts into sentences

[Generative deduction](/en/generative-deduction) produces **new knowledge** (deduced facts); **Realization**
does the next step: it turns a known fact `(subject, predicate, object)` into a **readable sentence**.
QPath states what it **knows**, not what it imagines. Deterministic, **0 tokens**, no invention: the
sentence says nothing that is not already in memory.

> 💡 **The principle.** Answer in natural language without "generating text at random". We start from a
> real fact and **dress it up**: the right preposition, the right article, the copula, agreement, lists.
> The form is produced by rules; the **content** stays a stored fact.

> 🎯 **Use case.** Answer the user with a **sentence**, not a triple. Memory holds "marie · lives_in ·
> paris"; Realization turns it into "Marie lives in Paris", and can **say it differently** ("Marie resides
> in Paris") on request, without inventing anything. The problem it solves: give the structured memory a
> **readable voice** while staying faithful to the facts (each sentence re-reads to the same scene).

## The exact inverse of reading

QPath already reads the endless surface forms of language and reduces them to a small set of **canonical
relations** ("I come from Jacmel", "I am originally from Jacmel" and "I am a native of Jacmel" all denote
the same origin relation). Realization walks that bridge **the other way**: from a known relation to a
natural sentence. Because storage stays **on the surface** (the predicate is already a verb, "lives in",
"comes from"), realizing is mostly putting back the little words that reading absorbed.

## The judge: the round trip

This is the guarantee that sets Realization apart from a "text generator": it is **verifiable by
construction**. We realize the fact into a sentence, then **re-read** that sentence with QPath's reader;
if it lands back on the **same relation** and the **same object**, realization **preserved the meaning**.

```
fact: (marie, lives, Paris)
   │  realization
   ▼
"Marie lives in Paris."
   │  re-reading (QPath's reader)
   ▼
relation "location", object Paris   ✓  identical to the starting fact
```

This check is **deterministic** and cannot be fooled: no fluency model to satisfy, no score to maximize.
A sentence that does not re-read to the same meaning is simply rejected.

## What v1 can say

| Fact type | Example input | Sentence produced |
| --- | --- | --- |
| Class (is a) | `(jacmel, est_une, ville)` | **Jacmel est une ville.** |
| Attribute / profession | `(jean, est, médecin)` | **Jean est médecin.** |
| Location | `(marie, habite, paris)` | **Marie habite à Paris.** |
| Origin | `(pierre, vient_de, jacmel)` | **Pierre vient de Jacmel.** |
| Multiple objects | `(marie, habite, [paris, lyon])` | **Marie habite à Paris et Lyon.** |

The class article follows **gender** (une ville / un médecin), the subject is **capitalized**, and nouns
keep their original **display case**.

## In practice

```ts
import { realizeFact } from '@damba/libxn';

realizeFact({ s: 'jacmel', p: 'est_une', o: 'ville' }, { gender: () => 'f' });
// → "Jacmel est une ville."

realizeFact({ s: 'marie', p: 'habite', o: 'paris' }, { typer });
// → "Marie habite à Paris."   (the "à" is added; the sentence re-reads as "location")

realizeFact({ s: 'pierre', p: 'vient_de', o: 'jacmel' }, { typer });
// → "Pierre vient de Jacmel."
```

- `gender(w)` supplies gender (for the article); `display(w)` the display case; `typer` types the object
  (place, person, organization) to pick the right phrasing. All **optional**: with no context,
  Realization stays correct on the simple cases.
- `realizeStructured(fact)` also returns the **verb** and **preposition** used, which lets you replay the
  round trip and **certify** the sentence.

## Saying a fact in several ways (recombination)

The same fact can be said in several ways, **all true**. QPath knows that "habiter", "vivre", "résider",
"se trouver à" and "être à" denote the same relation; it can therefore **recombine** these attested forms
to vary the wording without ever changing the meaning:

```ts
import { recombineFact } from '@damba/libxn';

recombineFact({ s: 'marie', p: 'habite', o: 'paris' }, { typer });
// → [ "Marie habite à Paris.", "Marie est à Paris.", "Marie se trouve à Paris.", … ]
```

**Every variant passes the same round-trip check**: it re-reads to the same relation and object. Variety
is free in fluency but **never at the cost of truth** (no word is swapped for a loose synonym that would
drift the meaning). `pickVariant(fact, seed)` picks a wording **deterministically** (same seed → same
sentence) to avoid robotic repetition while staying reproducible.

On the product side, you can simply ask QPath to **"say it differently"**: it takes its last statement and
offers another attested wording of the same fact, without ever changing its meaning.

## Re-telling a comprehended scene

When a sentence contains a pronoun ("Marc dropped the glass, **it** broke"), QPath first understands **what**
the pronoun refers to (here the glass, not Marc), then **re-tells** the scene correctly:

```
"Marc dropped the glass, so it broke."
```

The re-telling attributes each state to the **right** entity, adds the logical connector ("so", "then"), and
uses a pronoun only when it is safe to do so. As everywhere in Realization, nothing is invented: QPath reuses
the words that were actually written, and the produced sentence **re-reads** to the same scene.

## Where it fits

Realization is the **voice** of memory: wherever QPath must answer with a sentence about what it knows
(describe an entity, confirm a fact), it produces a **fluent, grounded and verifiable** utterance without
resorting to free generation. It pairs naturally with [generative deduction](/en/generative-deduction)
(which finds *what* to say) and [reasoning](/en/reasoning-types) (which decides *whether* it can be said).

> The strength stays **structured and verifiable**: QPath puts into words what it knows, and every
> sentence can be re-read back to the fact it was born from.
