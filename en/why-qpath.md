# Why QPath

## The problem: an LLM alone isn't enough

Large language models are remarkable at **understanding and producing language**. But used alone, they
suffer from four **structural** weaknesses — not bugs, limits by nature:

- **Hallucination** — they invent plausible but false facts, without knowing it.
- **Forgetting** — they have no persistent memory: whatever isn't in the context is lost.
- **Cost** — every answer consumes tokens; re-supplying context is paid for at each turn.
- **Opacity** — you can't explain *why* an answer came out. A black box.

In a demo, these limits pass. In production — healthcare, finance, legal, autonomous agents — they become
deal-breakers.

## QPath fills exactly these gaps

QPath is a **symbolic memory**: a structure that stores facts and reasons **deterministically**, at
**zero token**. Its properties answer the LLM's weaknesses point by point:

| LLM weakness | QPath's answer |
|--------------|----------------|
| Hallucination | **Determinism** — same facts → same answers, never invented |
| Forgetting | **Persistent memory** — auditable, editable, accumulating |
| Cost (tokens) | **Zero token** — instant, free retrieval and reasoning |
| Opacity | **Traceability** — every conclusion comes with its reasoning path |

## QPath + LLM: true complementarity

The key point: **one's strengths are the other's weaknesses.** Pitting them against each other is a
mistake; combining them is the right architecture.

- **The LLM brings**: language fluency, generalization, handling of fuzziness, open-ended reasoning.
- **QPath brings**: memory, verifiable truth, determinism, traceability, zero cost.

Together: **QPath decides and remembers, the LLM verbalizes.** The LLM no longer relies on its fuzzy
memories but on a verifiable memory — it can no longer hallucinate what QPath knows. And whatever QPath
doesn't know yet, the LLM can reason out, then it's **fed back into QPath**: knowledge grows instead of
being re-paid. *(See [Flash reasoning](flash-reasoning).)*

> In one sentence: **the LLM makes QPath eloquent; QPath makes the LLM reliable.**

## Key geometry preserves structure

A hash table **destroys** the structure of keys: the hash scatters them, so it can only do an **exact
lookup**. QPath instead encodes each key as a **path** (bit pairs → directions). Two keys that share a byte
prefix — `alice`/`alicia`, or a scoped identifier `user:42:…` — then share a **path prefix**. Because that
**same** path representation is used everywhere in the system, you get "for free" the **fuzzy recall**
capabilities a hash has no native answer for:

- **Nearest neighbors** — the keys with the longest shared prefix, from closest to least close, **without
  scanning** the whole set (cost stays nearly flat as the number of keys grows). Useful for approximate
  resolution: variants, typos, scoped keys.
- **Prefix query** — all keys under a given prefix (a range query).
- **Position-wise similarity** — tolerates a difference **in the middle** of the key (`alice` vs `alike`),
  reusing the same path representation as the exact search.

On scoped keys (`user:<id>:<field>`), compared to scanning a plain map, the prefix search measures a
speedup that **grows with size**: ~1.8× at 1,000 keys, ~7× at 10,000, ~292× at 100,000 — a QPath query's
cost stays roughly flat where the scan grows linearly.

> Honest framing: this is the advantage of **any** path-preserving structure over a hash, not a
> mathematical impossibility elsewhere. What makes it a coherent asset is the **uniform** use of the same
> QPath path representation across the whole system. Position-wise similarity, for its part, scans the key
> set (linear cost): reserve it for reasonable sets, or as a second stage after a prefix filter.

## What QPath brings, domain by domain

### Healthcare & life sciences
**Need:** **justifiable** recommendations, not a black box. **QPath:** every conclusion is traced (from
symptom to suggestion), the patient memory is editable and auditable, nothing is invented.

### Finance, insurance & banking
**Need:** **explainable**, reproducible eligibility and risk decisions (regulator). **QPath:**
deterministic reasoning over clear rules, a trace for every decision, zero drift.

### Legal & compliance
**Need:** show *why* a clause applies, cite the chain of rules. **QPath:** explicit chaining of facts and
rules; the answer is defensible, not probabilistic.

### Customer support & business assistants
**Need:** consistent, up-to-date answers, without reinventing each conversation. **QPath:** a shared,
reliable memory; the LLM verbalizes, QPath guarantees accuracy. Fewer tokens, more consistency.

### Autonomous AI agents
**Need:** memory between steps, without re-paying context or hallucinating its own memories. **QPath:**
the agent writes its facts and reads them back at zero token; its memory is inspectable and fixable.

### Education & training
**Need:** a tutor that actually tracks what the learner masters. **QPath:** a per-learner knowledge
model, persistent and traceable; the LLM adapts, QPath keeps the thread.

### Edge, mobile & sovereignty
**Need:** **offline** AI, without sending sensitive data to the cloud. **QPath:** runs locally (browser,
mobile, embedded), no dependency, no network call; data never leaves the device.

### Enterprise knowledge
**Need:** a queryable relations layer without deploying a heavy graph database. **QPath:** profiles,
catalogs, business ontologies in a lightweight, deterministic, editable structure.

### Research & R&D
**Need:** reason over structured facts, test hypotheses, keep a trace. **QPath:** a unified substrate to
store, cross-reference and infer — reproducible and inspectable.

## In short

Generative AI needs a **ground truth layer**. QPath is that layer: **deterministic, traceable, zero-token**
memory and reasoning that turn a brilliant-but-fallible LLM into a **reliable, explainable and frugal**
system — across every domain where error, cost or opacity matter.

::: tip
See [how the components fit together](components) and the [Flash reasoning pattern](flash-reasoning) that
combines QPath, web search and an LLM.
:::
