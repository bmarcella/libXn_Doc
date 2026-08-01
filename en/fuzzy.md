# Fuzzy logic — answer in shades, prove in numbers

"Is Paris hot?" has no honest binary answer: 28 °C is *rather* hot. QPath's **fuzzy logic** answers
with a **degree** ("Rather hot — degree 0.6") computed exactly from the stored value, proof attached.
Deterministic, **zero token**, and faithful to the house principle: ignorance stays ignorance — if the
value is missing, the engine does not answer "degree 0", it says it does not know.

> 💡 **The principle.** An adjective like "hot", "rich" or "close" becomes a **fuzzy term**: a graded
> zone over a numeric quantity (temperature, salary, distance). The answer is no longer yes/no but a
> membership degree between 0 and 1 — always accompanied by the value that produced it.

> 🎯 **Use case.** You define "hot" once; from then on, every "is X hot?" question is answered in
> shades, for any subject that carries a temperature. Graded rules chain: "if the engine is hot, the
> room is at risk" propagates the degree instead of truncating it into a boolean.

## Define a term in natural language

No form, no formula: one sentence is enough. Four shapes cover the common uses:

| Shape | You say |
|---|---|
| rising | "hot for temperature: from 25, fully at 35" |
| falling | "cold for temperature: fully until 5, gone at 15" |
| peak | "mild for temperature: around 20, between 15 and 25" |
| plateau | "comfortable for temperature: from 18 to 30, fully from 21 to 26" |

The parser is **conservative**: bounds must be explicit, nothing is invented, and an ambiguous
sentence is refused with an explanation — better to ask again than to store a wrong definition. The
stored definition is readable and editable like any other knowledge in the memory.

## Answer with a degree, prove with numbers

Once "hot" is defined and "Paris temperature is 30" is known:

> **Is Paris hot?**
> Rather hot (degree 0.5 · temperature = 30).

The answer always shows **the value that produced it**: you can verify it, contest it, recompute it.
Two people asking the same question over the same facts get the same degree, today and in a year.

## Graded rules

Fuzzy terms compose into rules that **propagate the degree** instead of crushing it: a rule's
conclusion inherits the strength of its conditions, chains converge in a bounded way, and the switch
to binary (act / don't act) happens only at **decision time**, never midway. Derived facts keep their
degree as provenance: you know a conclusion is "0.7 sure" and why.

## In practice

```ts
import { FuzzyEngine, parseFuzzyDefinition } from '@damba/libxn';

const p = parseFuzzyDefinition('hot for temperature: from 25, fully at 35');
await new FuzzyEngine(kb).defineTerm(p.def, { kind: 'user', ref: 'chat' });

await kb.tell('paris', 'temperature', '30');
new FuzzyEngine(kb).degreeOf('paris', p.def.term);
// → { degree: 0.5, trace: { predicate: 'temperature', value: 30 } }
```

Fuzzy logic complements [Bayesian belief](/en/belief): fuzziness grades **what values mean** (is 28 °C
hot?), belief grades **what knowledge is worth** (how established is this fact?). Both answer in
shades, proofs attached.
