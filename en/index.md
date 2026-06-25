---
layout: home

hero:
  name: QPath
  text: A deterministic symbolic memory
  tagline: Fact memory and reasoning — deterministic, zero-token, dependency-free. The LLM becomes optional; memory and reasoning live here.
  image:
    src: /logo.svg
    alt: QPath
  actions:
    - theme: brand
      text: Get started
      link: /en/04-guides/getting-started
    - theme: alt
      text: Why QPath
      link: /en/why-qpath
    - theme: alt
      text: Use cases
      link: /en/use-cases
    - theme: alt
      text: Overview
      link: /en/00-overview
    - theme: alt
      text: Factflow
      link: /en/dynamic-behavior

features:
  - title: Behavior = governed facts
    details: Not just memory — the app's LOGIC (flows, rules, limits, fraud checks) lives in facts you query, govern and evolve AT RUNTIME, without redeploying. Deterministic and traceable. Showcase&#58; npm run example:ledger.
  - title: Exact & deterministic retrieval
    details: Same data, same answers — exact, reproducible retrieval, reliable at scale, at zero token.
  - title: Symbolic & deterministic
    details: Facts (subject, predicate, object), O(1) inverse indices, traced forward/backward chaining. The LLM is an optional verbalizer; reasoning lives here.
  - title: 100% recall, sub-millisecond
    details: Built-in benchmark (npm run bench) — exact retrieval, rules, multi-variable joins, numeric comparisons, aggregates and quantifiers at 100% recall, ~0.07 ms/query.
  - title: Isomorphic & zero-dependency
    details: Runs in Node, the browser, Web Workers. dependencies&#58; {}. Periphery (Three.js, pgvector, embeddings) plugs in via ports.
---

::: info npm release — December 21, 2026 at 21:12
The **QPath / LibXN** code (`@damba/libxn`) will be **published on npm on December 21, 2026 at 21:12**.
:::
