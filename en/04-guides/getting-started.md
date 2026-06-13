# Getting started

## Installation

### In this repo (current)

The core lives in `packages/libxn/` and is consumed via the TypeScript alias `@damba/libxn` (declared in
the root `tsconfig.json`). Nothing to install — import directly:

```ts
import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';
```

### As an npm package (soon)

Once published:

```bash
npm install @damba/libxn
```

The package has **zero runtime dependencies**.

## Hello QPath

```ts
import { XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });

// Ingestion
await grid.processData('the cat sleeps');
await grid.processData('the dog runs');

// Approximate recall
const r = grid.predict('the cat');
console.log(r.exact, r.values);

// Full-text search
console.log(grid.findValuesContaining('cat'));

// Persistence
const snap = grid.serialize();
const restored = XNeuroneGrid.fromSnapshot(snap);
```

> `headless: true` = no rendering. To visualize, register a view factory
> (`XNeuroneGrid.viewFactory`) — see [architecture](architecture).

## Facts & reasoning

```ts
import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('socrates', 'is', 'human');
await kb.tell('human', 'is', 'mortal');
await kb.tell('mortal', 'has', 'end');

const chain = new ChainResolver(kb).chain('socrates', 'has');
console.log(ChainResolver.format(chain!));
```

## Tests & benchmark

The core runs under [vitest](https://vitest.dev) (Node runner, no browser — proof the core runs
outside Angular):

```bash
cd packages/libxn
npm install
npm test       # the test suite
npm run bench  # benchmark report (recall + latency across the built-in scenarios)
```

More runnable examples in [`../examples/`](../examples/).

## Node / backend (CommonJS)

The package is **dual ESM + CJS** (built with [tsup](https://tsup.egoist.dev): `dist/index.js` ESM,
`dist/index.cjs` CJS, `dist/index.d.ts`), so it is consumable from a CommonJS backend (e.g. NestJS).
In this repo, the `server/` backend declares it as a local dependency:

```jsonc
// server/package.json
"dependencies": { "@damba/libxn": "file:../packages/libxn" }
```

> ⚠️ Build order: build the package **before** installing/building the server, because the `file:`
> dependency points at `dist/`:
> ```bash
> cd packages/libxn && npm install && npm run build
> cd ../../server   && npm install
> ```

Being **isomorphic and dependency-free**, the same core serves the front (via the source alias) and
the back (via the CJS package). NestJS integration example: `server/src/qpath/qpath.service.ts`
(`QPathService`, an injectable wrapping a `KnowledgeBase`). Smoke test: `node server/scripts/libxn-smoke.cjs`.
