# Memory that learns — nap-grid

Alongside [grid prediction](/en/prediction) (deterministic, weightless) and
[trainable QPath networks](/en/qpath-ml) (a network fed by an encoding), **nap-grid** is a third path:
**the growing graph IS the network**. The memory grows as data arrives, and it **learns what matters at
the same time**.

> 💡 **The idea.** The pure grid remembers everything with equal weight: it can't tell that one feature
> matters more than another, and on a never-seen combination it can only fall back. nap-grid adds learned
> weights **on the graph itself**: it **generalizes** to inputs it never stored, while staying
> **deterministic** (fixed seed) and **auditable** (you read which path weighed in, and by how much).

## What it unlocks

| Capability | Grid alone | nap-grid |
|---|---|---|
| Feature importance | all weighted equally | learns and **shows** which path weighs |
| **Never-seen** feature combination | falls back / fails | **interpolates** via shared weights |
| **Online** learning | grows without learning | grows **and** adjusts, on every sample |
| Confidence | counted (frequency) | carried by memorized depth |

nap-grid is **not** an LLM: zero tokens, deterministic, and every prediction carries its rationale.

## Usage

The input is encoded into **QPath directions** (as everywhere in the lib), then you train online and
predict with a built-in audit.

```ts
import { NapGrid, encodeFeatures } from '@damba/libxn-nap-grid';

const nap = new NapGrid({ seed: 1 });                       // robust default

// Online learning: each row grows the graph AND adjusts the weights.
nap.train(
  rows.map(r => ({ dirs: encodeFeatures([r.area, r.distance]), target: r.price / scale })),
  { epochs: 2000, lrDecay: 0.9997 },
);

// AUDITABLE prediction: the value + the path that produced it.
const p = nap.predict(encodeFeatures([area, distance]));
//   → { value, depthReached, contributions: [{ depth, dir, shared, local, gate }, …] }
```

`depthReached` tells **how much** of the input was actually in memory (the rest is filled by
generalization); `contributions` details **the weight of each step** — that's the explainable prediction.

## In Damba — auditable numeric prediction

The `NapGridService` trains a model on tabular rows and answers with a **rationale** (which features
weighed in), at zero tokens.

```ts
napGrid.train(houses, 'price', { epochs: 2000 });

napGrid.predict({ area: 80, distance: 3 });
//   → { value: 210_000, confidence: 0.75,
//       because: [ { feature: 'area',     contribution: 190_000 },
//                  { feature: 'distance', contribution:  12_000 } ] }
```

Damba can thus answer "~210,000, mostly because of the area" **and back it with the path**, without
calling a language model.

## Training on the memory's facts

Rather than an external dataset, nap-grid trains directly on the numeric **`(subject, predicate, object)`
facts** already in memory: group by **subject** (each entity = one row), numeric predicates become
**features**, a chosen predicate becomes the **target**. Text facts are ignored, a missing predicate is
imputed by its mean, and large values (salaries, prices) are scaled automatically.

```ts
import { factsToRows, TabularModel } from '@damba/libxn-nap-grid';

// Facts in memory: (alice, seniority, 5) (alice, team, 3) (alice, salary, 61000) (alice, name, "Alice")…
const { rows, features } = factsToRows(facts, 'salary');
//   rows = [{ seniority: 5, team: 3, salary: 61000 }, …]   features = ['seniority', 'team']

const model = new TabularModel({ seed: 1 });
model.fit(rows, 'salary', { epochs: 2000 });

model.predict({ seniority: 10, team: 3 });
//   → { value: ~78000, confidence, because: [ { feature: 'seniority', … }, … ] }
```

> Measured on a noisy employee memory: the estimate drops to ≈ 2,400 error vs ≈ 16,700 for the plain
> mean (≈ 7× better), close to the noise floor. All **deterministic** and **auditable** (you read which
> predicate weighed in).

## Classifying a category (classification)

nap-grid isn't only about numbers: it also predicts a **category** (a flower's species, a status, a
type). Same principle — numeric features, categorical target — but it trains **one network per class**
("is it this category?"), then picks the most confident.

```ts
import { factsToLabeledRows, TabularClassifier } from '@damba/libxn-nap-grid';

// Facts: (iris_3, petalLength, 54) (iris_3, sepalLength, 65) … (iris_3, species, 'virginica')
const { rows, labels } = factsToLabeledRows(facts, 'species');   // labels = ['setosa','versicolor','virginica']

const clf = new TabularClassifier({ seed: 1 });
clf.fit(rows, { epochs: 1500 });

clf.predict({ sepalLength: 50, sepalWidth: 34, petalLength: 15, petalWidth: 2 });
//   → { label: 'setosa',
//       scores: [ { label: 'setosa', prob: 0.56 }, … ],   // per-class probabilities (sum = 1)
//       because: [ { feature: 'petalLength', … }, … ] }   // per-feature audit
```

> Measured on Iris: **≈ 88 % correct** on never-seen flowers (chance with 3 classes = 33 %).
> Deterministic, and the answer says **why** (which measurement decided).

## The functions

- **`NapGrid(options?)`** — the memory that learns. `train(samples, { epochs, lrDecay })` (online
  learning), `observe(dirs, target)` (one step), `predict(dirs)` (value **+ audit**), `value(dirs)` (value
  only). Options: `seed`, `learningRate`, and the knobs of the generalization / memorization blend.
- **`StatGrid`** — the pure statistical grid, provided as a comparison **baseline**.
- **`encodeNumber(v, bits?)` / `encodeFeatures(values, bits?)`** — encode a value or a feature vector into
  QPath directions.
- **`factsToRows(facts, target)`** / **`TabularModel`** — REGRESSION: assembles numeric rows from facts,
  `fit` / `predict` (value + `because`), automatic feature scaling.
- **`factsToLabeledRows(facts, target)`** / **`TabularClassifier`** — CLASSIFICATION: categorical target,
  `fit` / `predict` (label + per-class probabilities + `because`).

> 🔁 **Deterministic & portable.** With a fixed seed, training replays identically.

## How to test it

The package is **fully tested**, including an **exhaustive sweep of 10,000 cases** (the whole `(A,B)`
grid at 100×100 resolution) that checks the invariants on every input: finite prediction, complete audit,
memory bounds, and determinism across the whole settings matrix.

```bash
cd packages/libxn-nap-grid
npm install
npm test        # full suite, including the 10,000 exhaustive cases
npm run bench   # comparison table: statistical grid vs nap-grid, on never-seen inputs
```

## Going further

- [Prediction (grid)](/en/prediction) — regression / classification **without weights**, on the grid.
- [QPath networks (ML)](/en/qpath-ml) — a **separate** network fed by the QPath encoding (don't confuse).
- [Entity memory](/en/entity-memory) — similarity and missing trait, **without training**.
