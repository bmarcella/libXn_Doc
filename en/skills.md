# Skills — know-how you install, and that checks itself

An instruction in a prompt tells the model how to work. It gets forgotten, it has no scope, it
cannot be uninstalled, and above all **nothing verifies it was followed**. A Damba **skill** is the
same knowledge, but written as **installable facts** — paired with a **check** that reads the result
back.

> 💡 **The principle.** *An instruction file tells the model; Damba verifies the model.* Whatever is
> testable leaves the prompt and enters the check. An instruction is forgotten; a test fails.

> 🎯 **Use case.** "Here is how we write an interface around here." The know-how installs like a
> package, activates per account, enters the prompt at the right moment, and what comes out is read
> back. A violation does not say "error 4021": it **quotes the installed rule** that was broken.

## Three fidelities, because not everything fits in triples

Know-how is not homogeneous, and forcing it into a single format would be a mistake. A skill is
sorted into three categories, and the category decides the treatment:

| Nature | Example | Becomes |
| --- | --- | --- |
| **Decidable rule** | a class assembled at runtime exists nowhere | an executable check |
| **Prohibition** | no decorative pictogram standing in for an icon | a negative fact |
| **Taste** | keep a restrained palette | prose, retrieved when relevant |

Only the first category can cause a refusal. The other two inform, they do not judge — and that
boundary is held by the data, not by the code.

## What is installed decides; the engine has no opinion

This is the property that separates a skill from a check frozen into the product: **severity lives
in the pack**, not in the engine.

The same text, two installed skills, two verdicts — refused under one, merely flagged under the
other, without a single line of the engine changing. And **removing the skill removes the check**:
there is nothing else to switch off.

## The gate: what separates a skill from an instruction

After generation, the check reads back. Three behaviours, in this order:

1. **It quotes the fact that was broken**, never just an internal code. You trace the refusal back to
   the line you installed, read it, and remove it if you disagree. That is the auditability point,
   and it is what no conventional verification tool offers.
2. **It decides by installed severity**: refusal for what is certain, a warning for what is
   indicative. When in doubt it warns — it never refuses.
3. **It proposes a fix, and only when it can guarantee it.** The fix is read back by the check
   **before** being offered. When it is not safe, nothing is proposed and that is stated. A faulty
   fix would cost more than no fix at all.

## Measured, not asserted

Every step of this capability had to clear a numeric bar, and two of them were recalibrated by
measurement rather than intuition.

**Injection works, and we know by how much.** On a set of generation requests built to trigger the
fault, the installed skill takes the faulty-answer rate from **80% down to 50%** — five requests
improved out of six, none degraded, and a gap that separates from chance under two independent
statistical readings.

**The remaining 50% is precisely why the check exists.** An instruction followed half the time is
not a half success: it is the demonstration that the instruction alone is not enough. Passed through
the check, the faulty answers are all refused, and each receives a verified fix.

**A rule announced as "verifiable" may not be.** Measurement invalidated two of them before they
cost anything: one was broader than reality and flagged perfectly correct code, the other required a
grammatical analysis that a pattern check cannot perform. They remain true and named, but they moved
to prose. **You do not know in advance what is decidable; you measure it.**

## What the gate does not say

To be held as firmly as the rest: the check only catches **what we managed to name**. Code that
passes is not correct code — it is merely free of the faults that have a rule. The check judges
neither taste, nor architecture, nor relevance.

## See also

- [Fact types](/en/fact-types) — the flags and provenance a skill rests on
- [Companion facts](/en/companion-facts) — the grouping that makes a pack an installable unit
- [Factflow](/en/dynamic-behavior) — **action** skills: a procedure, not know-how
- [Prompt lifecycle](/en/prompt-lifecycle) — where a skill enters the conversation
