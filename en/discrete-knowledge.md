# Discrete knowledge (facts) vs continuous (documents)

QPath is a memory for **discrete knowledge**: **atomic facts**, each expressible as a
**subject → predicate → object** triple, retrieved and reasoned over **deterministically, at 0 token**.
Telling discrete from continuous knowledge is knowing **when QPath is the right tool**.

> 🎯 **Use case.** "The VAT rate is 20%", "Alice works at Acme", "the statute of limitations is 6 years":
> these precise statements call for an **exact answer, always the same**. Conversely, "sum up the novel's
> mood" is continuous, where an LLM shines. The problem it solves: know **when** to put knowledge in QPath
> (the discrete, verifiable kind) rather than hand everything to a model that approximates.

## What is a discrete fact?

A **precise, self-contained** statement that stands on its own:

- Paris **is the capital of** France
- The criminal statute of limitations **is** 6 years
- The VAT rate **is** 20%
- A dog **is a** mammal
- Alice **works at** Acme

Each fits `(subject, predicate, object)` and is retrieved **exactly**, without ambiguity.

## Why it's the heart of QPath

For discrete knowledge, QPath delivers what a probabilistic model cannot guarantee:

- **Deterministic** — the same question always yields the same answer, no hallucination.
- **0 token** — retrieval and reasoning (inheritance, transitivity, aggregates) cost nothing.
- **Auditable & editable** — every fact has a source; you add, fix or retract a fact one at a time.

Ideal for: **rules, definitions, structured data, policies, ontologies, references**.

## The other nature: continuous knowledge

A **book**, an article, a report: **long prose** where meaning is spread out, contextual, nuanced.
Reducing it to clean triples would lose the meaning. This is handled by a **complementary semantic**
layer (embeddings): you retrieve the **relevant passage by meaning**, not by an exact fact.

## How to choose

| Question | Then |
|---|---|
| Can I write it as **one precise factual sentence**? | **Discrete fact** → QPath |
| Is it **long prose** whose meaning depends on context? | **Document** → semantic search |

## A mental image

- **Discrete** = **index cards** in a drawer: each card is an exact fact, retrieved with certainty.
- **Continuous** = a **book** on a shelf: you search for the right passage by meaning.

## They complement each other

QPath (discrete facts) **anchors** the truth — exact, traceable, 0 token; the semantic layer
**broadens** retrieval to long texts. In practice you reason over facts and lean on documents for
context: this is the **hybrid** approach.
