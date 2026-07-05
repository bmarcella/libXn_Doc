# Trainable QPath networks — learning on the directional language

Alongside [grid prediction](/en/prediction) (deterministic, weightless), QPath can also **train** small
networks whose **input is the QPath directional representation**, not raw floats. You get **compact**,
**reproducible** (fixed seed) classifiers and regressors whose size **does not grow with input length**.

> 💡 **The idea.** You encode a value, a record or a text into a **directional input**, then train a light
> head on top. Depending on the task, pick an **order-invariant** network (fast, global profile) or an
> **order-sensitive** one (reads the sequence). Everything is **deterministic** and **serializable**.

The pipeline is always the same three steps: **encode** the input → **train** (`fit`) → **predict**
(`predict`). The sections below detail each building block and **every one of its parameters**.

## The shared vocabulary (read once)

These notions recur across every building block. Understanding them is enough to read the rest.

| Term | What it is | How to choose it |
|---|---|---|
| **quat** | a pair of 2 bits → a direction (LEFT/RIGHT/DOWN/UP). QPath's basic unit. | Produced by the encoder; you never handle it by hand. |
| **`bits`** | number of bits a value is written on before being split into quats. **Must be even.** Default `8`. | More bits = more **resolution** (tells close values apart) but a longer input. 8 is often enough; 16 for wide ranges. |
| **`mode`** | how a quat becomes features: `'onehot'` (4 values per quat, **default**) or `'bits'` (2 values, more compact). | `'onehot'` by default (more expressive). `'bits'` if you want a half-size input. |
| **`hidden`** | size of the **directional embedding**: the FIXED-size summary the network builds of the input, whatever its length. | Larger = more capacity (but more overfitting risk). Typically 4–16. |
| **`readout` / `LayerSpec[]`** | the **head**: a list of layers `{ units, activation? }` stacked after the embedding. The last layer = the output. | `[{ units: 1, activation: 'sigmoid' }]` for a probability; `units` = number of outputs. |
| **`activation`** | a layer's non-linearity: `'sigmoid'` (0..1), `'relu'` (≥0), `'tanh'` (−1..1), `'identity'` (linear). | `sigmoid` for a probability output; `relu`/`tanh` for inner layers; `identity` for unbounded regression. Per-layer default = `sigmoid`. |
| **`epochs`** | number of full passes over the training data. **Required** in `fit`. | Too few = underfit; too many = overfit. Start with 100–500. |
| **`lr`** | *learning rate*: the size of the weight-update step. Default `0.1`. | Too large = diverges; too small = slow. `0.1` by default; **`~0.01` for text** (ASCII is dominated by one direction). |
| **`onEpoch`** | optional callback `(epoch, loss)` called each epoch, to trace the loss curve. | Useful to check whether training converges. |
| **`rng`** | **seeded** pseudo-random generator (`mulberry32(seed)`). Default `mulberry32(1)`. | Fix the seed → training **replays bit-for-bit**. Change it to vary initialization. |
| **sample** | one training datum. Directional nets: `{ quats, y }`; MLP: `{ x, y }`. `y` is the **target vector** expected at the output. | `y: [1]`/`[0]` to classify; `y: [value]` to regress. |

## Encode an input — `QuatEncoder` / `TextQuatEncoder`

The encoder turns a value, object or text into a directional input ready for the networks. It is a **black
box**: you hand it the data, it returns the input.

```ts
import { QuatEncoder, TextQuatEncoder } from '@damba/libxn-qpath-ml';

const enc  = new QuatEncoder({ bits: 8, mode: 'onehot' });  // values & records
const text = new TextQuatEncoder({ bitsPerChar: 16 });       // text (per UTF-16 character)

enc.encode({ area: 120, price: 30 });                        // a record -> features (stable length)
enc.quatsOf(42);                                             // a number -> quats (to feed a network)
text.quatsOf('profession');                                 // a word -> quats
```

**`QuatEncoder({ bits?, mode? })`**

| Parameter | Type | Default | Role |
|---|---|---|---|
| `bits` | `number` (even) | `8` | Resolution: bits per value before splitting into quats. Odd → error. |
| `mode` | `'onehot' \| 'bits'` | `'onehot'` | Feature width per quat (4 vs 2 values). |

Methods: `quatsOf(value)` → `Quat[]` (for the networks) · `encode(value \| record)` → flattened features
(for an MLP) · `featureSize` = `keyCount × (bits/2) × (4 if onehot, 2 if bits)`, an MLP's input size.

**`TextQuatEncoder({ bitsPerChar?, maxChars? })`** — encodes **text**, one character at a time (UTF-16
code → `bitsPerChar` bits → quats).

| Parameter | Type | Default | Role |
|---|---|---|---|
| `bitsPerChar` | `number` (even) | `16` | Bits per character (16 = full UTF-16). |
| `maxChars` | `number` | — | Truncates beyond N characters (bounds the length). |

Method: `quatsOf(text)` → `Quat[]`.

## Classify / regress — directional network

`DirectionalNet` learns a property from the **directional profile** of the input. Its specialized part has
a **fixed size**, **whatever the input length** — ideal for variable-length inputs. It is
**order-invariant**: it reads the global profile, not the sequence.

```ts
import { QuatEncoder, DirectionalNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const data = rows.map(r => ({ quats: enc.quatsOf(r.value), y: [r.label] }));   // label 0/1

const net = new DirectionalNet(8, [{ units: 1, activation: 'sigmoid' }], { act: 'relu' });
net.fit(data, { epochs: 300, lr: 0.1 });

net.predict(enc.quatsOf(newValue));                  // → [probability]
```

**`new DirectionalNet(hidden, readout, opts?)`**

| Parameter | Type | Default | Role |
|---|---|---|---|
| `hidden` | `number` | — | Directional embedding size (capacity, independent of input length). |
| `readout` | `LayerSpec[]` | — | The head: layers `{ units, activation? }` after the embedding. Last layer = output. |
| `opts.act` | `Activation` | `'relu'` | Activation of the **directional layer** (the embedding). |
| `opts.rng` | `Rng` | `mulberry32(1)` | Initialization seed (determinism). |

`fit(data, { epochs, lr?, onEpoch? })` where `data: { quats, y: number[] }[]` · `predict(quats)` →
`number[]` · `paramCount` = total number of weights.

## When ORDER matters — recurrent network

Some tasks depend on the **order** of the sequence (not just the global profile). `DirectionalRecurrentNet`
**reads** the input step by step and captures those dependencies, where an order-invariant network would plateau.

```ts
import { QuatEncoder, DirectionalRecurrentNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const rnn = new DirectionalRecurrentNet(6, [{ units: 1, activation: 'sigmoid' }], { act: 'tanh' });
rnn.fit(data, { epochs: 300, lr: 0.1 });
rnn.predict(enc.quatsOf(x));                          // → [probability]
```

**`new DirectionalRecurrentNet(hidden, readout, opts?)`** — same interface as `DirectionalNet`.

| Parameter | Type | Default | Role |
|---|---|---|---|
| `hidden` | `number` | — | Size of the recurrent state (memory carried from one step to the next). |
| `readout` | `LayerSpec[]` | — | The readout head after the sequence. |
| `opts.act` | `Activation` | `'tanh'` | Activation of the **recurrent core** (`tanh` bounds the state, standard for recurrence). |
| `opts.rng` | `Rng` | `mulberry32(1)` | Initialization seed. |

> A generic deep MLP (`MLP`) remains available for already-flattened features — handy as a baseline, but
> the directional network is the **QPath-native** path (fixed size, length-agnostic).

**`new MLP(inputSize, specs, rng?)`** — classic multilayer perceptron over already-flattened vectors.

| Parameter | Type | Default | Role |
|---|---|---|---|
| `inputSize` | `number` | — | Input vector length (e.g. `encoder.featureSize`). |
| `specs` | `LayerSpec[]` | — | Stacked layers `{ units, activation? }` (`activation` default `'sigmoid'`). |
| `rng` | `Rng` | `mulberry32(1)` | Initialization seed. |

`fit(data, { epochs, lr?, rng?, onEpoch? })` where `data: { x: number[], y: number[] }[]` · `predict(x)` → `number[]`.

## Route a fact — `FactRouter`

`FactRouter` classifies an **already-extracted candidate**: its **type** (e.g. *fact / companion / vault /
media*) and independent **flags** (e.g. *cascade*). It **does not generate** the triples (that stays the
deterministic pipeline); it **decides** where to file a candidate. Small, trainable, **serializable**.

```ts
import { TextQuatEncoder, FactRouter } from '@damba/libxn-qpath-ml';

const enc = new TextQuatEncoder();
const router = new FactRouter(4, { hidden: 10, numFlags: 1 });   // 4 types, 1 flag

router.fit(
  examples.map(e => ({ quats: enc.quatsOf(e.predicate), type: e.type, flags: [e.cascade] })),
  { epochs: 300, lr: 0.01 },   // ⚠️ small lr for text (see "choosing your values")
);

router.predict(enc.quatsOf('profession'));
//   → { type: 0, typeProbs: [...], flags: [0.92] }

// Persistence: a small JSON, reloaded identically.
const json = router.toJSON();
const same = FactRouter.fromJSON(json);
```

**`new FactRouter(numTypes, opts?)`**

| Parameter | Type | Default | Role |
|---|---|---|---|
| `numTypes` | `number` | — | Number of possible **types** (softmax head: a single type wins). |
| `opts.hidden` | `number` | `8` | Directional embedding size. |
| `opts.numFlags` | `number` | `0` | Number of independent **flags** (multi-label sigmoid heads). `0` = none. |
| `opts.act` | `Activation` | `'relu'` | Activation of the directional layer. |
| `opts.rng` | `Rng` | `mulberry32(1)` | Initialization seed. |

`fit(data, { epochs, lr?, onEpoch? })` where `data: { quats, type: number, flags?: number[] }[]` ·
`predict(quats)` → `{ type, typeProbs: number[], flags: number[] }` (the winning type, each type's
probability, and each flag ∈ 0..1) · **`toJSON()` / `FactRouter.fromJSON(json)`** to store/reload the model.

## Choosing your values (practical guide)

- **`epochs`** — start at 100–300. Watch the loss via `onEpoch`: if it stalls, increase; if it climbs
  back up, that's overfitting (reduce).
- **`lr`** — `0.1` by default. **For text**, drop to **`~0.01`**: ASCII written on 16 bits is dominated by
  the LEFT direction (high bits at 0), and a large step makes training diverge.
- **`hidden`** — larger = more capacity, but more overfitting risk and more compute. 4–8 for a simple
  signal, 10–16 for text or many classes.
- **`bits` / `mode`** — raise `bits` (8 → 16) if your values span a wide range and the network confuses
  close values. `mode: 'bits'` halves the input size if needed.
- **Output activation** — `sigmoid` for a probability (0..1), `identity` for unbounded regression,
  `softmax` (via `FactRouter`) to pick ONE class among several.
- **Seed (`rng`)** — fix it for reproducible results; vary it to test stability.

## The functions (summary)

- **`QuatEncoder({ bits?, mode? })`** — encodes a value/object; `encode`, `quatsOf`, `featureSize`.
  **`TextQuatEncoder({ bitsPerChar?, maxChars? })`** — encodes **text** (`quatsOf`).
- **`DirectionalNet(hidden, readout, { act?, rng? })`** — order-invariant network; `fit(data, { epochs, lr?, onEpoch? })`,
  `predict(quats)`, `paramCount`. Fixed-size directional part.
- **`DirectionalRecurrentNet(hidden, readout, { act?, rng? })`** — **order-sensitive** variant; same interface.
- **`MLP(inputSize, specs, rng?)`** — generic multilayer perceptron (flattened features).
- **`FactRouter(numTypes, { hidden?, numFlags?, act?, rng? })`** — classifies a candidate: `predict`
  (`{ type, typeProbs, flags }`), `fit`, **`toJSON` / `fromJSON`**.

## Use cases

| Need | Network |
|---|---|
| Classify / score from an input **profile**, varied lengths | `DirectionalNet` |
| Task that depends on the **order** of the sequence | `DirectionalRecurrentNet` |
| **Route** a fact candidate (type + flags) to the right ring | `FactRouter` |
| Baseline with already-flattened features | `MLP` |

> 🔁 **Reproducible & portable.** With a fixed seed, training replays identically, and a model fits in a
> **small JSON** (`toJSON`/`fromJSON`) — easy to store server-side and reload.

## Going further

- [Prediction (grid)](/en/prediction) — regression / classification **without weights**, directly on the grid.
- [Memory that learns (nap-grid)](/en/nap-grid) — the growing graph **is** the network (memory + learning).
- [Entity memory](/en/entity-memory) — similarity & missing trait, **without training**.
- [Fact extraction](/en/fact-extraction) — where the candidates that `FactRouter` classifies come from.
