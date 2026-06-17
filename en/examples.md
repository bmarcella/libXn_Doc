# Examples

A collection of short, concrete recipes. Every example uses the public API of `@damba/libxn`. For
scenarios by domain, see [Use cases](use-cases).

## Setup

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const kb = new KnowledgeBase(grid);
```

`new XNeuroneGrid(encoder?, opts?)`:

| Argument | Role | Default |
|---|---|---|
| `encoder?` | `(data) => [number,number][]` function encoding an input into bit pairs ("quats"). `undefined` = default encoder (`BinaryConverter.toBinaryPairs`). | default encoder |
| `opts?` | options; only key is `headless?: boolean`. `true` = no Three.js rendering (Node/server/test); `false` = attaches the view if a `viewFactory` is registered. | `{}` (so `headless` unset → render if available) |

`new KnowledgeBase(grid)` takes **a single argument**: the `grid` (the QPath graph used as working memory). If the grid comes from a reloaded snapshot, the constructor automatically rebuilds its internal indices.

## Memory & facts

### 1. Store and read facts

```ts
await kb.tell('marc', 'likes', 'chocolate');
await kb.tell('marc', 'lives_in', 'montreal');

kb.ask('marc', 'likes');               // ['chocolate']
kb.askInverse('likes', 'chocolate');   // ['marc']  (who likes chocolate?)
```

`kb.tell(s, p, o, source?, flags?)` records a fact (subject, predicate, object):

| Argument | Role | Default |
|---|---|---|
| `s` | subject | required |
| `p` | predicate (relation) | required |
| `o` | object (value) | required |
| `source?` | provenance of the fact (where it comes from) — used by provenance and re-verification | — (no source) |
| `flags?` | fact flags (`closed`, `major`, `secret`…), set **atomically** with the write | — |

Return: `Promise<ContradictionReport | null>` — `null` if all is well, a contradiction report if the fact conflicts with an existing one. `tell` is **async** (the write may be persisted); reads (`ask`, `askInverse`…) are **synchronous**.

- `kb.ask(s, p)`: **forward** direction (subject + predicate → objects). Returns a `string[]` (empty if nothing).
- `kb.askInverse(p, o)`: **inverse** direction (predicate + object → subjects). Returns a `string[]`.

### 2. Set queries (intersection / union)

```ts
await kb.tell('julie', 'likes', 'chocolate');
await kb.tell('julie', 'lives_in', 'montreal');

kb.askIntersect([['likes', 'chocolate'], ['lives_in', 'montreal']]); // ['marc', 'julie']
kb.askUnion([['likes', 'chocolate'], ['lives_in', 'paris']]);        // everyone matching either
```

`askIntersect(conditions)` and `askUnion(conditions)` take **a single argument**: `conditions`, an array of **`[predicate, object]` pairs** (`Array<[string, string]>`).

- `askIntersect`: subjects satisfying **ALL** conditions (logical AND). Returns `string[]`; an empty array or any condition with no subject yields `[]`.
- `askUnion`: subjects satisfying **AT LEAST ONE** condition (logical OR). Returns a deduplicated `string[]`.

### 3. Compare two subjects

```ts
const cmp = kb.askCompare('marc', 'julie');
cmp.common;   // identical facts
cmp.onlyIn1;  // specific to marc
cmp.onlyIn2;  // specific to julie
```

`kb.askCompare(s1, s2)` takes **two subjects** to compare. Return: an object with three lists, each an array of `{ p, o }` (predicate / object) pairs:

- `common` — facts **identical** in `s1` and `s2` (same predicate **and** same object);
- `onlyIn1` — facts present **only** in `s1`;
- `onlyIn2` — facts present **only** in `s2`.

### 4. Similarity

```ts
kb.askSimilar('marc', 3).map(r => r.subject); // the 3 subjects closest to 'marc'
```

`kb.askSimilar(s, topN?)`:

- `s` — the reference subject;
- `topN?` — maximum number of neighbour subjects to return (default **`5`**).

Return: an array of `{ subject, similarity, commonFacts }` objects sorted from closest to farthest — `subject` (the neighbour), `similarity` (proximity score) and `commonFacts` (number of shared facts). Empty array if `s` has no facts.

## Reasoning

### 5. Reasoning chain + readable trace

```ts
import { ChainResolver } from '@damba/libxn';

await kb.tell('socrates', 'is', 'human');
await kb.tell('human', 'is', 'mortal');
await kb.tell('mortal', 'has', 'end');

const chain = new ChainResolver(kb).chain('socrates', 'has');
ChainResolver.format(chain!);
// → "socrates —is→ human —is→ mortal —has→ end  (⇒ has = end, confidence 1.00, via transitive)"
```

`new ChainResolver(kb, algebra?)`:

- `kb` — the knowledge base to traverse;
- `algebra?` — the predicate algebra (how transitive relations compose); default `PredicateAlgebra.withDefaults()`. Pass it only to customize composition rules.

`resolver.chain(s, targetP, opts?)` finds the **shortest** chain linking `s` to an object via the composite predicate `targetP` (BFS):

| Argument | Role | Default |
|---|---|---|
| `s` | starting subject | required |
| `targetP` | predicate (possibly composite) to reach | required |
| `opts?` | `{ maxDepth?, confidence? }` — max search depth and confidence policy | `maxDepth: 4`, `confidence: 'min'` |

Return: a `ReasoningChain` object (with `steps`, `conclusion`, `confidence`, `via`) or **`null`** if no chain exists — hence the `chain!` in `format` when you know one exists.

`ChainResolver.format(chain)` is a **static** method: it takes a `ReasoningChain` and returns a readable `string`.

### 6. All possible conclusions

```ts
const resolver = new ChainResolver(kb);
resolver.chainAll('socrates', 'is').map(c => c.conclusion.o); // ['human', 'mortal', ...]
```

`resolver.chainAll(s, targetP, opts?)` has the **same signature** as `chain` (same `opts`: `maxDepth` default `4`, `confidence` default `'min'`), but returns **all** valid chains — a `ReasoningChain[]` (not a single one, nor `null`). Each element exposes `conclusion.o` (the concluded object).

### 7. Verify a derived fact (true / false)

```ts
resolver.verifyChain('socrates', 'has', 'end');     // true
resolver.verifyChain('socrates', 'has', 'feathers'); // false
```

`resolver.verifyChain(s, p, o, opts?)` checks that a **derived** fact `(s, p, o)` does follow by chaining:

| Argument | Role | Default |
|---|---|---|
| `s` | subject | required |
| `p` | predicate to reach | required |
| `o` | object expected in the conclusion | required |
| `opts?` | same options as `chain` (`maxDepth`, `confidence`) | `maxDepth: 4`, `confidence: 'min'` |

Return: `boolean` — `true` if a chain exists **and** its conclusion matches `o` exactly, `false` otherwise.

### 8. Business rules → derived facts

```ts
import { RuleEngine } from '@damba/libxn';

const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X uses typescript => X understands javascript');
await rules.applyAllRules();

kb.askInverse('understands', 'javascript'); // every TS user (inferred)
```

`new RuleEngine(kb, persistent?, store?, storageKey?)`:

| Argument | Role | Default |
|---|---|---|
| `kb` | the knowledge base to derive over | required |
| `persistent?` | if `true`, loads/saves rules via `store`; `false` = **in-memory only** (as here) | `true` |
| `store?` | the key-value store that persists rules | `new MemoryStore()` |
| `storageKey?` | persistence key (lets you scope rules, e.g. per conversation) | internal default key |

`rules.addRuleFromText(text, name?, origin?)`:

- `text` — the rule as text, `premise => conclusion` (uppercase variables like `X`);
- `name?` — optional readable name for the rule;
- `origin?` — rule origin: `'manual'` (default), `'induced'` or `'document'`.

Return: the created `Rule` object, or **`null`** if the text could not be parsed into a valid rule.

`rules.applyAllRules()` is **async** and takes no argument; it applies the rules by forward chaining until saturation and returns a `Promise<number>` — the **number of derived facts** added.

## Text & ingestion

### 9. Turn prose into facts

```ts
import { NaturalParser } from '@damba/libxn';

const parsed = NaturalParser.parse('the cat is an animal');
if (parsed.kind === 'statement') {
  await kb.tell(parsed.s, parsed.p, parsed.o); // cat / is / animal
}
```

`NaturalParser.parse(text)` is **static** and takes **a single argument**: the raw text. Return: an object discriminated by its `kind` field —

- `'statement'` → `{ kind, s, p, o }`: a statement usable by `kb.tell` (the `if` check above);
- `'what'` / `'yesno'` / `'list'` → a **question** (never to be stored);
- `'unknown'` → `{ kind, text }`: not interpreted.

> 💡 A **question** must never become a fact: the `if (parsed.kind === 'statement')` guard is what ensures only statements are recorded.

### 10. Ingest text + full-text search

```ts
await grid.processData('the cat sleeps on the couch');
await grid.processData('the dog runs in the garden');

grid.findValuesContaining('cat'); // ['the cat sleeps on the couch']
```

`grid.processData(data, opts?)` is **async**: it encodes `data` (any type) and ingests it into the graph. `opts?` accepts `{ skipView?: boolean }` (default `{}`) — `skipView: true` skips the render refresh. Return: `Promise<void>`.

`grid.findValuesContaining(query, limit?)`:

- `query` — substring to search for (case-insensitive);
- `limit?` — maximum number of results (default **`10`**).

Return: `string[]` — stored values containing `query` (empty if `query` is empty).

## Learning

### 11. Classification (learn by example)

```ts
import { BinaryConverter } from '@damba/libxn';
const enc = (row: object) => BinaryConverter.toBinaryPairs(row);

await grid.trainClass(enc({ area: 120, rooms: 4 }), 'house');
await grid.trainClass(enc({ area: 35, rooms: 1 }), 'studio');

grid.predictClass(enc({ area: 110, rooms: 4 })).label; // 'house'
```

`BinaryConverter.toBinaryPairs(data)` is **static** and takes **a single argument** (`data`, any primitive/array/object). Return: `[number, number][]` — the list of bit pairs ("quats") fed to training and prediction.

`grid.trainClass(pairs, label)` is **async**:

- `pairs` — the encoded input (`[number,number][]`);
- `label` — the class label for this example.

Return: `Promise<void>`.

`grid.predictClass(pairs)` takes the encoded input and returns (**synchronously**) an object `{ label, probability, depth, samples, distribution }`: `label` (most likely class, or `undefined` if nothing was learned on this path), `probability` (its probability), `depth` (depth reached), `samples` (number of examples seen) and `distribution` (the full breakdown `{ label, count, probability }[]`).

### 12. Regression (predict a number)

```ts
await grid.train(enc({ area: 120, rooms: 4 }), 480000);
await grid.train(enc({ area: 60, rooms: 2 }), 240000);

grid.predictNumeric(enc({ area: 115, rooms: 4 })).value; // ~ estimated price
```

`grid.train(pairs, target)` is **async**:

- `pairs` — the encoded input (`[number,number][]`);
- `target` — the **numeric** value to learn for this input.

Return: `Promise<void>`.

`grid.predictNumeric(pairs)` takes the encoded input and returns (synchronously) an object `{ value, depth, samples }`: `value` is the estimated number (or `undefined` if no sample on this path), `depth` the depth reached, `samples` the number of aggregated examples.

### 13. Native generation (recombine what was learned)

```ts
await grid.processData('hello ');
await grid.processData('howdy ');
grid.generate({ steps: 4 }).text; // a sequence of genuinely ingested fragments
```

`grid.generate(opts?)` takes **a single argument**, an options object (default `{}`):

| Option | Role | Default |
|---|---|---|
| `seed?` | start input — if provided, generation begins where this seed lands in the grid (instead of the door) | — (start at the door) |
| `steps?` | number of items to emit | `8` |
| `temperature?` | `1.0` = raw weights; `<1` = sharper toward frequent paths; `>1` = more uniform (floored at `0.001`) | `1.0` |

Return: `{ text, items, path, stoppedEarly }` — `text` (concatenated fragments), `items` (emitted values), `path` (traversed nodes) and `stoppedEarly` (true if the walk stopped before `steps`).

## Persistence

### 14. Save and restore the graph

```ts
const snapshot = grid.serialize();
const restored = XNeuroneGrid.fromSnapshot(snapshot);
restored.countNodes(); // same graph
```

`grid.serialize(opts?)` takes an optional options object (default `{}`): only key is `lite?: boolean` (omits some data for a lighter snapshot). Return: a serializable `GridSnapshot` (JSON).

`XNeuroneGrid.fromSnapshot(snapshot, encoder?)` is **static**:

- `snapshot` — the `GridSnapshot` returned by `serialize()`;
- `encoder?` — encoder to attach to the rebuilt grid (default: the default encoder).

Return: a new, rebuilt `XNeuroneGrid`. `grid.countNodes()` takes no argument and returns the `number` of neurons in the graph.

### 15. Persistence + search in a vector database

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));
await store.save('my-kb', kb.grid.serialize());   // persist
const snap = await store.load('my-kb');            // reload
```

`new QdrantVectorStore(url?)` takes **a single argument**: `url`, the Qdrant server URL (default `'http://localhost:6333'`).

`new VectorGridStore(store)` takes **a single argument**: the underlying `VectorStore` (here the Qdrant adapter) — it does the actual persistence.

- `store.save(key, snapshot)` — **async**; `key` is the key to store the snapshot under, `snapshot` is the `GridSnapshot` (from `grid.serialize()`). Return: `Promise<void>`.
- `store.load(key)` — **async**; returns a `Promise<GridSnapshot | null>` (**`null`** if the key is absent, or on an id collision to guard against serving the wrong snapshot).

> Semantic search (`searchSemantic`) plugs in by providing a `TextEmbedder` — see
> [Architecture](04-guides/architecture).

## Benchmark

### 16. Measure recall & latency

```ts
import { Benchmark } from '@damba/libxn';

const summary = await new Benchmark().runAll();
summary.globalRecall;   // 1  (100%)
summary.meanLatencyMs;  // ~0.08
```

`new Benchmark()` takes no argument. `benchmark.runAll(scenarios?)` is **async**:

- `scenarios?` — list of scenarios to run; defaults to the built-in scenarios (`BENCH_SCENARIOS`).

Return: a `Promise<BenchSummary>` whose key fields are `globalRecall` (overall pass rate, `1` = 100%), `meanLatencyMs` (mean latency per query, in ms) and the per-scenario detail in `results`.
