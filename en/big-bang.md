# Big Bang reasoning

**Big Bang** is a **reasoning mode** of QPath — alongside ChainResolver, RuleEngine, PingPong and Plot.
Where the others **follow a chain** or **apply a rule**, Big Bang **reasons by analogy and by
regularity**: it **searches for similarities** across the whole grid, **compiles** them, and **deduces
new solid facts**. Deterministic, **0-token**, no LLM.

## The principle

You know facts about many subjects. Big Bang exploits what subjects that **resemble one another** share:

- **Analogy** — **similar** subjects (those sharing facts with the target) *vote* for the properties the
  target **doesn't have yet**.
- **Class regularity** — if **almost all** members of a class have a property, the target **probably**
  has it too.

## Example

> Socrates and Plato are mortal men. Aristotle is a man ⇒ **Aristotle is probably mortal.**

The deduction **emerges from similarities** — nobody wrote it explicitly.

## Solidity = corroboration

Every deduced fact carries:

- its **confidence** — its corroboration: the more cases attest it, the more **solid** it is;
- its **provenance** — **what / who** supports it.

A trait held by **a single** neighbor is **discarded**; one shared by **all** is **kept**. Nothing is
asserted blindly — every deduction is **explainable**.

## Its place among the modes

| Mode | What it does |
|---|---|
| **ChainResolver** | follows a known **chain** (inheritance, transitivity) |
| **RuleEngine** | **applies** a rule |
| **Plot** | links **causes** and **order** of events |
| **Big Bang** | **discovers** by **resemblance** — generalizes from the known to the probable |

Together: **retrieve**, **chain**, **apply**, and now **generalize** — without ever leaving determinism
or traceability.
