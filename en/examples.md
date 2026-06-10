# Examples

A collection of short, concrete recipes. Every example uses the public API of `@damba/libxn`. For
scenarios by domain, see [Use cases](use-cases).

## Setup

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const kb = new KnowledgeBase(grid);
```

## Memory & facts

### 1. Store and read facts

```ts
await kb.tell('marc', 'likes', 'chocolate');
await kb.tell('marc', 'lives_in', 'montreal');

kb.ask('marc', 'likes');               // ['chocolate']
kb.askInverse('likes', 'chocolate');   // ['marc']  (who likes chocolate?)
```

### 2. Set queries (intersection / union)

```ts
await kb.tell('julie', 'likes', 'chocolate');
await kb.tell('julie', 'lives_in', 'montreal');

kb.askIntersect([['likes', 'chocolate'], ['lives_in', 'montreal']]); // ['marc', 'julie']
kb.askUnion([['likes', 'chocolate'], ['lives_in', 'paris']]);        // everyone matching either
```

### 3. Compare two subjects

```ts
const cmp = kb.askCompare('marc', 'julie');
cmp.common;   // identical facts
cmp.onlyIn1;  // specific to marc
cmp.onlyIn2;  // specific to julie
```

### 4. Similarity

```ts
kb.askSimilar('marc', 3).map(r => r.subject); // the 3 subjects closest to 'marc'
```

## Reasoning

### 5. Reasoning chain + readable trace

```ts
import { ChainResolver } from '@damba/libxn';

await kb.tell('socrates', 'is', 'human');
await kb.tell('human', 'is', 'mortal');
await kb.tell('mortal', 'has', 'end');

const chain = new ChainResolver(kb).chain('socrates', 'has');
ChainResolver.format(chain!);
// → "socrates —is→ human —is→ mortal —has→ end  (⇒ has = end, confidence 1.00)"
```

### 6. All possible conclusions

```ts
const resolver = new ChainResolver(kb);
resolver.chainAll('socrates', 'is').map(c => c.conclusion.o); // ['human', 'mortal', ...]
```

### 7. Verify a derived fact (true / false)

```ts
resolver.verifyChain('socrates', 'has', 'end');     // true
resolver.verifyChain('socrates', 'has', 'feathers'); // false
```

### 8. Business rules → derived facts

```ts
import { RuleEngine } from '@damba/libxn';

const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X uses typescript => X understands javascript');
await rules.applyAllRules();

kb.askInverse('understands', 'javascript'); // every TS user (inferred)
```

## Text & ingestion

### 9. Turn prose into facts

```ts
import { NaturalParser } from '@damba/libxn';

const parsed = NaturalParser.parse('the cat is an animal');
if (parsed.kind === 'statement') {
  await kb.tell(parsed.s, parsed.p, parsed.o); // cat / is / animal
}
```

### 10. Ingest text + full-text search

```ts
await grid.processData('the cat sleeps on the couch');
await grid.processData('the dog runs in the garden');

grid.findValuesContaining('cat'); // ['the cat sleeps on the couch']
```

## Learning

### 11. Classification (learn by example)

```ts
import { BinaryConverter } from '@damba/libxn';
const enc = (row: object) => BinaryConverter.toBinaryPairs(row);

await grid.trainClass(enc({ area: 120, rooms: 4 }), 'house');
await grid.trainClass(enc({ area: 35, rooms: 1 }), 'studio');

grid.predictClass(enc({ area: 110, rooms: 4 })).label; // 'house'
```

### 12. Regression (predict a number)

```ts
await grid.train(enc({ area: 120, rooms: 4 }), 480000);
await grid.train(enc({ area: 60, rooms: 2 }), 240000);

grid.predictNumeric(enc({ area: 115, rooms: 4 })).value; // ~ estimated price
```

### 13. Native generation (recombine what was learned)

```ts
await grid.processData('hello ');
await grid.processData('howdy ');
grid.generate({ steps: 4 }).text; // a sequence of genuinely ingested fragments
```

## Persistence

### 14. Save and restore the graph

```ts
const snapshot = grid.serialize();
const restored = XNeuroneGrid.fromSnapshot(snapshot);
restored.countNodes(); // same graph
```

### 15. Persistence + search in a vector database

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));
await store.save('my-kb', kb.grid.serialize());   // persist
const snap = await store.load('my-kb');            // reload
```

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
