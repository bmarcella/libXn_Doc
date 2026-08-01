# Bayesian belief — knowing how well you know

QPath memory stores **facts**. But not all facts are equal: one has been confirmed ten times by
reliable sources, another was said once, in passing. **Bayesian belief** attaches to each fact a
**degree of confidence** that evolves with evidence — without ever touching the fact itself.
Deterministic, **zero token**, auditable: every belief can explain where it comes from.

> 💡 **The principle.** Each fact carries a belief that rises when evidence **confirms** it and falls
> when evidence **contradicts** it. Sources do not all weigh the same: a confirmation from a reliable
> source counts more than a rumor. And a fact **locked** by the user keeps a confidence floor:
> contrary evidence questions it, it does not erase it.

> 🎯 **Use case.** Two pieces of information contradict each other ("the office is in Lyon" / "the
> office is in Paris"): belief arbitrates through the evidence history, and an explicit user
> correction has authority. Or: "what is the most likely explanation?" — the best explanation is
> chosen by evidence weight, proof attached.

## What belief never does

Three non-negotiable invariants:

1. **The Bayesian layer never decides alone.** It weighs, it informs, it breaks ties at the margin —
   the decision to write, correct or retract a fact stays deterministic or human.
2. **An absent fact is not an unlikely fact.** If the memory does not know, the answer is "I don't
   know" — never "probably not".
3. **Belief does not modify the fact.** The triple stays intact, with its provenance; belief lives
   alongside it, like an annotation that evolves.

## How evidence flows

Every relevant event becomes **evidence**: a verification that confirms, a detected contradiction, a
user correction ("no, I meant…"), a prediction proven right or wrong after the fact. Belief updates
**incrementally and replayably**: the same evidence history always produces the same belief.

Facts marked by the user keep **floors**: a 🔒 locked fact never drops below a high threshold, a ⭐
structural fact keeps a solid base. Human authority outranks statistical accumulation.

## Best explanation

When several hypotheses explain the same observation, the engine picks the one evidence supports best
— and **shows its reasoning**: which evidence, what weights, what margin over the runner-up. An
informed, traceable choice, not an opaque verdict.

## In practice

```ts
import { BeliefEngine } from '@damba/libxn';

const belief = new BeliefEngine(kb);
belief.update('office', 'located_in', 'paris', { kind: 'confirm', source: { kind: 'user' } });
belief.update('office', 'located_in', 'lyon', { kind: 'contradict', source: { kind: 'document' } });

const b = belief.beliefOf('office', 'located_in', 'paris');
// b.mean: current confidence · b.strength: accumulated evidence weight
belief.askWithBelief('office', 'located_in'); // objects, ranked by belief
```

Belief complements [provenance](/en/fact-provenance) (where the fact comes from) and
[maintenance](/en/fact-maintenance) (is the fact still fresh): together they answer "what do we know,
since when, and how well".
