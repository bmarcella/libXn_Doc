# Trainable QPath networks — learning on the directional language

Alongside [grid prediction](/en/prediction) (deterministic, weightless), QPath can also **train** small
networks whose **input is the QPath directional representation**, not raw floats. You get **compact**,
**reproducible** (fixed seed) classifiers and regressors whose size **does not grow with input length**.

> 💡 **The idea.** You encode a value, a record or a text into a **directional input**, then train a light
> head on top. Depending on the task, pick an **order-invariant** network (fast, global profile) or an
> **order-sensitive** one (reads the sequence). Everything is **deterministic** and **serializable**.

## Encode an input

The encoder turns a value, object or text into a directional input ready for the networks. It is a **black
box**: you hand it the data, it returns the input.

```ts
import { QuatEncoder, TextQuatEncoder } from '@damba/libxn-qpath-ml';

const enc  = new QuatEncoder({ bits: 8 });          // values & records
const text = new TextQuatEncoder();                  // text (case-insensitive by default)

enc.encode({ surface: 120, prix: 30 });              // a record -> stable-length input
text.quatsOf('profession');                          // a word -> input (to feed a network)
```

## Classify / regress — directional network

`DirectionalNet` learns a property from the input's **directional profile**. Its specialized part has a
**fixed size**, **whatever the input length** — ideal for inputs of varying sizes.

```ts
import { QuatEncoder, DirectionalNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const data = rows.map(r => ({ quats: enc.quatsOf(r.valeur), y: [r.label] }));   // label 0/1

const net = new DirectionalNet(8, [{ units: 1, activation: 'sigmoid' }], { act: 'identity' });
net.fit(data, { epochs: 300, lr: 0.1 });

net.predict(enc.quatsOf(newValue));                  // → [probability]
```

## When ORDER matters — recurrent network

Some tasks depend on the **order** of the sequence (not just the global profile). `DirectionalRNN`
**reads** the input step by step and captures those dependencies, where an order-invariant network would
plateau.

```ts
import { QuatEncoder, DirectionalRecurrentNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const rnn = new DirectionalRecurrentNet(6, [{ units: 1, activation: 'sigmoid' }]);
rnn.fit(data, { epochs: 300, lr: 0.1 });
rnn.predict(enc.quatsOf(x));                          // → [probability]
```

> A generic deep `MLP` remains available for already-flattened features — handy as a baseline, but the
> directional network is the **QPath-native** path (fixed size, length-agnostic).

## Route a fact — `FactRouter`

`FactRouter` classifies an **already-extracted candidate**: its **type** (e.g. *fact / companion / vault /
media*) and independent **flags** (e.g. *cascade*). It **does not generate** the triplets (that stays in
the deterministic pipeline); it **decides** where to file a candidate. Small, trainable, **serializable**.

```ts
import { TextQuatEncoder, FactRouter } from '@damba/libxn-qpath-ml';

const enc = new TextQuatEncoder();
const router = new FactRouter(4, { hidden: 10, numFlags: 1 });   // 4 types, 1 flag

router.fit(
  examples.map(e => ({ quats: enc.quatsOf(e.predicat), type: e.type, flags: [e.cascade] })),
  { epochs: 300, lr: 0.05 },
);

router.predict(enc.quatsOf('profession'));
//   → { type: 0, typeProbs: [...], flags: [0.92] }

// Persistence: a small JSON, reloaded identically.
const json = router.toJSON();
const same = FactRouter.fromJSON(json);
```

## The functions

- **`QuatEncoder({ bits, mode? })`** — encodes a value/object into a directional input; `encode`,
  `quatsOf`, `featureSize`. **`TextQuatEncoder({ maxChars? })`** — encodes **text** (`quatsOf`).
- **`DirectionalNet(H, layers, opts?)`** — order-invariant network; `fit(data, { epochs, lr })`,
  `predict(input)`. Directional part of **fixed size**.
- **`DirectionalRecurrentNet(H, layers, opts?)`** — **order-sensitive** variant (reads the sequence); same
  `fit` / `predict` interface.
- **`MLP(size, layers, rng?)`** — generic multi-layer perceptron (flattened features).
- **`FactRouter(numTypes, { hidden, numFlags? })`** — classifies a candidate: `predictType`, `predict`
  (`{ type, typeProbs, flags }`), `fit`, **`toJSON` / `fromJSON`**.

## Use cases

| Need | Network |
|---|---|
| Classify / score from an input **profile**, varying lengths | `DirectionalNet` |
| Task that depends on the **order** of the sequence | `DirectionalRecurrentNet` |
| **Route** a fact candidate (type + flags) to the right ring | `FactRouter` |
| Baseline with already-flattened features | `MLP` |

> 🔁 **Reproducible & portable.** With a fixed seed, training replays identically, and a model fits in a
> **small JSON** (`toJSON`/`fromJSON`) — easy to store server-side and reload.

## Going further

- [Prediction (grid)](/en/prediction) — regression / classification **without weights**, directly on the grid.
- [Entity memory](/en/entity-memory) — similarity & missing trait, **without training**.
- [Fact extraction](/en/fact-extraction) — where the candidates that `FactRouter` classifies come from.
