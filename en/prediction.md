# Prediction — regression & classification

The same grid that memorizes facts can also **predict**. You **train** it with examples (features →
target), and it **predicts** the value or class of a new case. No classic neural network, no
dependency: it's **deterministic** and **interpretable** (you see how deep the grid could answer).

> 💡 **How it works, from above.** Each example encodes its features into a **path** in the grid and
> deposits its target there. At prediction time, you walk the new case's path: **the deeper you go, the
> more specific the prediction**.

## Train & predict

```ts
import { XNeuroneGrid, TabularEncoder } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const enc = new TabularEncoder(['surface', 'rooms', 'zone'], 16);

// Regression: learn a price from features.
for (const row of data) {
  await grid.train(enc.encode(row), row.price);
}

// Predict the price of a new property.
const p = grid.predictNumeric(enc.encode({ surface: 100, rooms: 4, zone: 1 }));
//    → { value: 312000, depth: 7, samples: 14 }
```

- **`train(pairs, target)` → `Promise<void>`** — regression: deposits a target **value** along the path
  and accumulates averages on the traversed nodes.
- **`predictNumeric(pairs)` → `{ value?, depth, samples }`** — returns the average at the reached node;
  `depth` = how deep it could answer, `samples` = how many examples support it.

## Classify

```ts
// Classification: learn a label.
for (const flower of iris) {
  await grid.trainClass(enc.encode(flower), flower.species);
}

const c = grid.predictClass(enc.encode(newFlower));
//    → { label: 'setosa', probability: 0.95, distribution: { setosa: 19, versicolor: 1 }, depth: 6 }
```

- **`trainClass(pairs, label)` → `Promise<void>`** — classification: deposits a **label** and counts
  classes along the path.
- **`predictClass(pairs)` → `{ label?, probability, distribution, depth, samples }`** — the most likely
  class **and** the full distribution at the reached node.

## Datasets to get started

Two **deterministic** synthetic datasets (seed → reproducible) let you try right away:

```ts
import { HousingDataset, IrisDataset, Benchmark } from '@damba/libxn';

const houses = HousingDataset.generate(200, 42);   // { surface, rooms, zone, price }
const flowers = IrisDataset.generate(50, 7);       // { sepal…, petal…, species }

// Measure the core (recall, latency) on reference scenarios.
const summary = await new Benchmark().runAll();      // { globalRecall, meanLatencyMs, … }
```

- **`HousingDataset.generate(n?, seed?)`** — synthetic real estate (regression). **`IrisDataset.generate(perClass?, seed?)`** — 3 species in 4 dimensions (classification).
- **`new Benchmark().runAll()`** — standalone harness: recall, latency, graph size.

## Use cases

| Situation | Mode |
|---|---|
| Estimate a price (real estate, quote) from features | **regression** (`train` / `predictNumeric`) |
| Classify (species, category, customer segment) | **classification** (`trainClass` / `predictClass`) |
| Recommend: the better features match, the more precise the answer | prediction `depth` |
| Test / certify the core without real data | `HousingDataset` / `IrisDataset` + `Benchmark` |

> 🔁 **Reproducible.** With a fixed seed, datasets **and** predictions replay identically —
> essential to compare and certify, where a sampled model cannot.
