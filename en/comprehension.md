# Comprehension — making meaning

QPath doesn't only **reason** (derive a conclusion from a fact); it **understands**: it **makes meaning**
of ambiguous information by **linking it to knowledge already in the grid**. The more QPath knows, the
better it understands. Everything is **deterministic, 0-token, traceable** — no LLM.

> Understanding = making meaning · linking to the already-known · interpreting context · building a
> representation of what is described.

## 1. Grid-informed coreference

> "John dropped his glass. **It** is broken."

What does "It" refer to? Naive coreference would say "the last subject" → *John* (wrong). QPath picks the
right antecedent by linking the **predicate** to each candidate's **known properties**:

- the grid knows a **glass** *is a fragile object* that *can break* → plausible;
- a **person** doesn't "break" → implausible.

⇒ **"It" = the glass.**

## 2. Causal and temporal interpretation

QPath builds the **scene representation**: from a common-sense schema `fall → can cause → break`, it
links the events —

> the glass broke **after** and **because of** the fall.

That representation is then **reasonable over**: trace the root cause, unroll consequences, order the
timeline.

## 3. Deduction by similarity ("Big Bang")

QPath searches for **similarities** across the whole grid, **compiles** them, and **deduces new solid
facts** —

> Socrates and Plato are mortal men. Aristotle is a man ⇒ **Aristotle is probably mortal.**

The deduction emerges from **subjects that resemble one another** and from **class regularities**. Each
deduced fact carries its **confidence** (its corroboration: the more cases attest it, the more solid)
and its **provenance** (what/who supports it) — nothing is asserted blindly.

## Why it's different

- **Linked to the already-known** — comprehension draws on a small common-sense seed **and** on the
  user's memory; it **improves as memory grows**.
- **Deterministic & traceable** — no black box: every interpretation/deduction is explainable.
- **0 token** — no language-model call.

Comprehension carries **reasoning** beyond explicit facts: interpret, represent, then deduce — the way
you understand a sentence, not just retrieve a datum.
