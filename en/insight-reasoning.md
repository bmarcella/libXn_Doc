# Proactive deduction

A reasoning mode that **speaks without a question**. The other engines answer when asked; this
one continuously sweeps the memory and **anticipates** — it proposes facts, and **alerts** the
user to what they haven't seen. Deterministic, at 0 tokens.

## Alerts

| Insight | What it detects | Example |
|---------|-----------------|---------|
| **contradiction** | two opposite facts coexist | "x likes tea" AND "x does not like tea" |
| **violated near-rule** | a strong regularity with ONE counterexample | "everyone living in France speaks French — except e. Missing data or exception?" |
| **missing data** | a class member lacking the attribute the others have | "Diana is the only employee without a salary" |
| **incoherent plot** | a cause proven to come after its effect | "the evacuation would cause the alarm, yet the alarm precedes the evacuation" |
| **stale facts** | freshness expired | "3 web facts older than 30 days to re-verify" |

## Anticipations

Around the subjects in focus (the current conversation):

- **similar subjects** — "titi resembles tweety (4 shared facts) — compare?";
- **little-known inherited facts** — "by the way: tweety has feathers (inherited from bird)".

## The contract

- Every insight carries a **stable key**: the host deduplicates — you are alerted **only once**.
- Alerts are **global** (the whole memory); focus only prioritizes.
- Everything is deterministic and traceable: an insight can be verified like any fact.

The memory becomes a **colleague**: it no longer just answers correctly — it notices what's
off, and says so.
