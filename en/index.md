---
layout: home

hero:
  name: QPath
  text: A content-addressable symbolic memory
  tagline: Fact memory and reasoning in a single graph — deterministic, zero-token, dependency-free. The LLM becomes optional; memory and reasoning live here.
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

features:
  - title: Content-addressable
    details: A datum's location is fully determined by its content — exact, deterministic retrieval with no external index.
  - title: Symbolic & deterministic
    details: Facts (subject, predicate, object), O(1) inverse indices, traced forward/backward chaining. The LLM is an optional verbalizer; reasoning lives here.
  - title: 100% recall, sub-millisecond
    details: Built-in benchmark (npm run bench) — exact retrieval, rules, multi-variable joins, numeric comparisons, aggregates and quantifiers at 100% recall, ~0.07 ms/query.
  - title: Isomorphic & zero-dependency
    details: Runs in Node, the browser, Web Workers, Deno. dependencies&#58; {}. Periphery (Three.js, pgvector, embeddings) plugs in via ports.
---
