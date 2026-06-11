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

The core runs under Node (no browser, no Angular — proof it is reusable):

```bash
cd packages/libxn
npm install
npm test      # vitest — 94 tests
npm run bench # benchmark report
```

```
CURRENT CAPABILITIES : recall 100% (28/28) · mean latency 0.07 ms · 4 scenarios
```

## Node / backend (CommonJS)

The package is **dual ESM + CJS**, so it is consumable from a CommonJS backend (e.g. NestJS). In this
repo, the `server/` backend declares it as a local dependency:

```jsonc
// server/package.json
"dependencies": { "@damba/libxn": "file:../packages/libxn" }
```

> Build order: build the package **before** installing/building the server (the `file:` dependency
> points at `dist/`):
> ```bash
> cd packages/libxn && npm install && npm run build
> cd ../../server   && npm install
> ```
