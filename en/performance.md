# Performance & guarantees

QPath makes strong promises — **deterministic**, **0-token**, **faithful at scale**. This page puts
**numbers** on them: properties *proven by tests* and performance *measured*, not asserted.

> 🎯 **Use case.** Before building on it, you want to know: "how many facts does it hold up to? does
> reasoning stay exact and free at scale?". This page **quantifies** the answers (measured recall, token
> cost, throughput), backed by tests. The problem it solves: decide **with confidence**, on reproducible
> measurements, not on promises.

## The guarantees (proven by tests)

- **Deterministic** — same inputs → same results, always. No hallucination.
- **Exact & reproducible retrieval** — same data, same answers; two logically identical writes yield
  the same result.
- **Faithful recall at scale** — the right information is served **even across tens of thousands of
  subjects**: no false facts, no cross-subject contamination.
- **Lossless persistence** — memory serializes and reloads identically.

## Measured baseline

Single Node thread, from one thousand to 50,000 facts:

| Facts | Ingest | Throughput | Read | Recall | Memory / fact |
|------:|-------:|-----------:|-----:|:------:|--------------:|
| 1,000  |  23 ms |  44,000/s | **0.9 µs** | **100%** | 6.3 |
| 5,000  |  72 ms |  70,000/s | **1.0 µs** | **100%** | 4.5 |
| 20,000 | 306 ms |  65,000/s | **1.6 µs** | **100%** | 4.1 |
| 50,000 | 782 ms |  64,000/s | **2.0 µs** | **100%** | 3.1 |

## What these numbers mean

- **Near-constant-time reads** — 50× more data only moves a question's latency from ~0.9 to ~2 µs.
  That's on the order of **500,000 reads per second** at 50,000 facts.
- **100% recall at any scale** — including 50,000 subjects. Fidelity does not degrade as memory grows.
- **Linear ingestion** — ~65,000 facts/s, no cliff up to 50,000.
- **Memory that amortizes** — the per-fact cost **drops** as the corpus grows (from 6.3 to 3.1),
  because the structure shares what is common.

## Reads at scale (up to 400,000 facts)

Beyond the baseline, we separate **indexed** reads (the normal path) from **scans**. p50 latencies,
pushed to 400,000 facts:

| Facts | `ask(s,p)` | `askInverse(p,o)` | `predicatesOf(s)` | `allFacts()` |
|------:|----------:|------------------:|------------------:|-------------:|
| 4,000   | 1.2 µs | 0.9 µs | 0.5 µs |   7 ms |
| 80,000  | 1.9 µs | 0.9 µs | 0.8 µs | 158 ms |
| 400,000 | 2.8 µs | 1.6 µs | 1.3 µs | **1.3 s** |

- **Indexed reads stay FLAT up to 400,000 facts**: `ask`, `askInverse`, `predicatesOf` are O(1) (mirror
  index), no cliff. A question's latency does not depend on the size.
- **`allFacts()` is O(F)**: it **enumerates everything** (status, sources, flags per fact), hence ~1.3 s at
  400,000 facts. It is the only heavy read path. Rule: call it **once** per request, never in a loop. A
  "lite" enumeration of triples only (no status/sources) is ~**2× faster**.

## Versus an LLM alone

| | LLM alone | QPath |
|---|---|---|
| Reading a fact | re-supply context, **tokens** | **~2 µs**, 0 token |
| Reliability | probabilistic (hallucination possible) | **deterministic**, measured 100% recall |
| Memory | context window, volatile | persistent, lossless |
| Explanation | black box | readable, auditable trace |

## Reproducible

Everything is verifiable, shipped with the package:

```bash
npm test            # characterization: encoding, serialization, reasoning surface, recall
npm run bench       # reasoning capabilities (100% recall)
npm run bench:scale # the scale baseline above
npm run bench:scale-reads # indexed reads vs scan, up to 400k
```

> QPath's internals (encoding, structure) are not publicly documented. What is presented here are the
> **observable guarantees** and the **measurements**.
