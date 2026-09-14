# Flow synthesis

Describe an automation in one sentence, and receive a [flow](/en/dynamic-behavior) that is already
verified:

> "When a quote arrives, if the amount exceeds 1,000, send an email to the manager, otherwise record
> the quote."

Damba composes the flow from **proven building blocks**, **verifies** it, then proposes it. No language
model is involved as long as the request fits what the blocks can do. When it does not, the AI takes
over, and its proposal goes through the same checks.

## How it works, from the outside

1. **The sentence becomes a goal**: trigger, conditions, actions of the "then" and "else" branches,
   loop, failure policy. The reader is deliberately closed: a clause it does not recognize makes it give
   up rather than guess.
2. **Blocks are composed.** Several assemblies are tried, from the simplest to the most expensive,
   within a bounded budget.
3. **Each candidate is verified** twice: by the flow validator (dead link, unbounded loop, forbidden
   tool, incomplete condition), then by a **simulated run** on cases drawn from the goal itself
   (condition true, each condition false, a tool that fails). No real tool is called during
   verification. A candidate is kept only if, in every case, it calls **exactly** the expected actions,
   in order.
4. **The first accepted candidate is proposed**, together with the refused candidates and their reason.
   Nothing is activated without you: the flow lands in the development overlay, like any proposed flow.

If no candidate passes, the request is reported as **unreachable with these blocks**, and that is when
the AI is called.

## What the blocks cover

| Need | Example phrasing |
| --- | --- |
| Trigger | form submission, a fact arriving or changing, scheduled, manual |
| Conditions | numeric and text comparisons, membership, non-empty value, conjunctions |
| Two branches | "if … then … otherwise …" |
| Bounded loop | "for each customer, at most 20" |
| Calling another flow | "call the reminder flow" |
| Result chaining | reuse the output of the previous action |
| Timers | "in 3 days", "every 7 days at most 4 times" |
| Waiting for a human answer | "ask … to … and on the answer …" |
| Failure policies | "with retry", continue or stop on failure |

A contradictory goal, a tool forbidden in the environment or an ambiguous sentence produce **no flow**:
they produce a reason.

## Measurement

On **123 flows written before this tool** (core examples, flows from the test benches, flows from the
guides), the goal of each was extracted and synthesis was asked to rebuild it with the real tools:

| Measure | Result |
| --- | --- |
| Flows recomposed | **64%** |
| Recomposed flows proven equivalent by execution | **50** |
| Wrong flows proposed | **0** |

The rest splits between constructs still outside the blocks and original flows that the validator
itself rejects. Every extension of the blocks was re-measured on the same corpus, with zero false
positives at each step. On the bench of hand-written goals, the search usually judges a single candidate
and answers in a few milliseconds, deterministically.

## In the chat

"Create a flow that…" tries synthesis first. When the blocks are not enough, the AI takes over and
proposes the flow. The preview says where the flow comes from: **"Composed and verified by Damba"**,
with the number of cases it was checked on, or **"Proposed by the AI"**, to be reviewed. Either way, the proposed flow goes through the validator and waits for your approval
before it is written.

## Using it in code

```ts
import { parseGoalSentence, synthesizeFlow } from '@damba/libxn';

const goal = parseGoalSentence(
  'when a quote is received, if the amount > 1000, then send an email, otherwise record',
  { name: 'quote' },
);
if (goal) {
  const r = await synthesizeFlow(goal, { tools, allowedTools });
  if (r.accepted) {
    // r.accepted.facts: the flow's facts, ready to write into the development overlay
  } else {
    // r.rejectedGoal or r.refused[].reason: why; this is where the AI takes over
  }
}
```

`tools` is your tool registry, `allowedTools` the list allowed in the environment. A `null` from the
reader means "sentence not recognized": invent nothing, hand over to the AI.

## Where it fits

It is the most direct application of [generative deduction](/en/generative-deduction): what Damba
generates natively are **proven structured artifacts**. See also
[Proposing missing values](/en/record-completion).
