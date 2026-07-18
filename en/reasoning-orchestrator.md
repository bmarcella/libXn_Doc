# Multi-step reasoning — the auditable chain of thought

A simple question is answered in one move: "where does Marie live?" reads a fact. A **composite**
question needs several moves, chained together: "what is the life expectancy of Marie's cat?" requires
recognizing that this cat is a cat, that a cat is a mammal, then reading the property on mammals.
**Multi-step reasoning** is the layer that coordinates those moves: it makes several reasoners **relay**
around the same fact memory until they reach a conclusion.

> 💡 **The principle.** QPath's "chain of thought" is not a string of words produced at random. It is a
> sequence of **grounded steps**, each one a real fact from memory. Thinking, here, means **walking the
> memory**, not generating text. The resulting trace can be re-read, verified and replayed.

## The opposite of a language model's "chain of thought"

A language model that "reasons step by step" produces intermediate sentences that can be neither
verified nor traced: nothing guarantees they match a fact. QPath's chain does the opposite. Each link is
a **stored** fact, with its provenance; the conclusion holds only if the whole chain holds. It is a
**deterministic, zero-cost** form of reasoning, and above all an **auditable** one: you can click each
step and trace back to the fact that justifies it.

```
Question: "is Marie's cat mortal?"

  1. Marie's cat is a cat        (known fact)
  2. a cat is a mammal           (known fact)
  3. a mammal is mortal          (known fact)
  ⇒ Marie's cat is mortal        conclusion, confidence 1.0
```

## A disposable working memory

Between two steps, an intermediate deduction ("this cat is a cat") must feed the next step. QPath writes
it into a temporary **working memory**, laid over the real memory. The next reasoner reads it as if it
were an established fact, then that working memory is **discarded** at the end. Nothing used to reason is
written into durable memory without validation: a question never changes what QPath knows.

## Deterministic decides, learned proposes

Several faculties can contribute. Some are **deterministic** (read a fact, follow inheritance, compose a
chain). Others are **learned** (sense a resemblance, propose a plausible link). The rule is strict and
never varies:

> A learned faculty may only **propose a link**. That link is kept only if a **deterministic faculty
> manages to conclude through it**. No learned faculty ever writes the answer itself.

This is the anti-fabrication guarantee: intuition may suggest a lead, but only grounded deduction
decides. A lead that nothing confirms is simply dropped.

## Always bounded, always a trace

Reasoning stops in every case: it either **concludes**, or declares the goal **underivable** ("I cannot
link these", rather than inventing), or reaches its **step limit**. It always returns a trace, even an
empty one. This discipline is what keeps QPath safe on a large corpus: it prefers saying "I don't know"
to fabricating an answer.

## Where you see it

- In the **chat**, an answer obtained by reasoning shows its step-by-step chain, each link labeled by
  the faculty that produced it, with direct access to the corresponding fact.
- Multi-step reasoning can also be invoked explicitly to resolve "what is the value of this property for
  this subject?" and return the conclusion **with** its justification.

## Related

- The [cognitive layer](/en/cognition): how faculties relay around the fact column.
- [Generative deduction](/en/generative-deduction): producing new, grounded knowledge.
- [Realization](/en/realization): turning the retained fact into a verifiable sentence.
- [Memory that learns](/en/nap-grid): a learned faculty that proposes, under control.
