# Troubleshooting & FAQ

The most common problems, and how to fix them.

## `npm install` fails with a 404 on `@damba/...`

The `@damba/*` packages are **not yet published on npm** (pre-1.0). Outside the monorepo, install with:

```bash
npm install --legacy-peer-deps
```

The `@damba/*` peer dependencies are then skipped at resolution; you provide them locally (sources or the
monorepo `dist`).

## At runtime: "X is not exported by @damba/libxn"

Typical symptom: a symbol exists in the **types** (`.d.ts`) but not in the **runtime** (`.js`). The core
`dist` is **stale** relative to the sources. Rebuild it:

```bash
cd packages/libxn && npm run build
```

General rule: **after any edit under `packages/**`, rebuild the `dist`** (tests consume the sources, but a
server consumes the `dist`).

## `distinctValues({ p: 'est' })` returns `[]`

Intended, but a footgun: the object aggregates (`distinctValues`, `frequencies`, `mode`, `concat`…)
**exclude reserved predicates** (`est`, `est_un`, `same_as`…) so they do not pollute results with the
ontology. To target a reserved predicate anyway:

```ts
kb.matchFacts({ p: 'est' });                       // -> the (s,p,o) facts
kb.matchFacts({ p: 'est' }).map(f => f.o);         // -> the objects
// or, where the flag is exposed:
kb.matchFacts({ p: 'est', excludeReserved: false });
```

## The 3D view "leaks" / "WebGL context lost" after several opens

An unreleased Three.js view keeps its GPU context (browser cap ~16 per tab). **Call `dispose()`** when you
detach the view:

```ts
grid.view.dispose();   // releases the animation loop, the WebGL context, the listeners
```

## I get no 3D rendering

The core is **headless by default**. Inject a view factory **before** building grids, on the browser side:

```ts
import { XNeuroneVisualizerForGrid } from '@damba/libxn-visualization';
XNeuroneGrid.viewFactory = (door) => new XNeuroneVisualizerForGrid(door);
```

## `allFacts()` is slow on a large corpus

`allFacts()` is O(F): it enumerates **everything** (status, sources, flags per fact). Call it **once** per
request, never in a loop. To read only triples, prefer targeted queries (`ask`, `askInverse`, `matchFacts`)
which are indexed. See [Performance](/en/performance).

## An LLM picks tools poorly

Do not give it all 230 tools at once: select the relevant ones with retrieval before sending them to the
model. See [Tool catalog](/en/tool-catalog).

```ts
const tools = toAnthropicTools(registry.search(userMessage, 16));
```

## A tool returns "ctx.X required"

Some tools need a **stateful** subsystem in the context (`rules`, `entityMemory`, `generator`,
`contextualizer`, `grid`). Provide it at call time:

```ts
const ctx = { kb, rules: new RuleEngine(kb) };
```

## A rule "every human is mortal" is not added

`addRuleFromText` expects the **DSL** (`X is human => X is mortal`), not natural language. For NL, go through
`NaturalRuleParser.parse(text)` first, then add the resulting `dsl`. See [Rules](/en/rules).
