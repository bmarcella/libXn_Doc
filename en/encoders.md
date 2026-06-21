# Encoders — text, tables, image, audio, video

Before learning anything, QPath must **turn an input into an internal representation**. **Encoders**
handle this for each data type — a word, a table row, an image, a sound, a video — while **preserving
similarity**: two close inputs land in the same place in memory.

> 💡 **One abstraction.** Whatever the modality, the output has the **same shape**. The grid then learns
> on it (memory, prediction, similarity) without knowing the source.

## Text & tabular data

```ts
import { SemanticEncoder, TabularEncoder, XNeuroneGrid } from '@damba/libxn';

// Text → encoding (close characters stay close).
const encoded = SemanticEncoder.toPairs('HELLO');

// Numeric row → encoding, FIXED column order (reproducible).
const enc = new TabularEncoder(['surface', 'rooms', 'zone']);
const row = enc.encode({ surface: 80, rooms: 3, zone: 2 });
```

- **`SemanticEncoder.toPairs(data)`** — encodes any primitive (text, number, boolean) into a
  representation the grid can use.
- **`new TabularEncoder(features)`** then **`encode(row)`** — encodes a `{ column: number }` row; the
  column order guarantees reproducibility.

## Image — coarse to fine

`PerceptualEncoder` (package `@damba/libxn-encoders`) encodes an image **coarse to fine**: the overall
shape first, the detail next. Two cat images therefore resemble each other from the start → **free
generalization**.

```ts
import { PerceptualEncoder } from '@damba/libxn-encoders';

const encoded = await PerceptualEncoder.encodeFromFile(file);   // from an <input type="file">
const grid = new XNeuroneGrid();
grid.train(encoded, 'cat');

// Another cat image lands in the same place.
const query = await PerceptualEncoder.encodeFromImage(img);
grid.predictClass(query);                                        // → { label: 'cat', … }
```

- **`encodeFromFile(file)` / `encodeFromImage(img)` / `encodeFromSource(src)`** — encodes an image
  (coarse to fine). `encodeFromSource` accepts a canvas / video / `ImageBitmap`.

## Audio & video

```ts
import { AudioEncoder, VideoEncoder } from '@damba/libxn-encoders';

// Audio: capture the mic and encode it (with a thumbnail + a replayable link).
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaStreamSource(stream).connect(analyser);
const { encoding, thumbnail, audioUrl } = await AudioEncoder.capture(ctx, analyser, stream, 2000);

// Video: several keyframes spread over the duration, each encoded.
const { codes, thumbnail: vthumb } = await VideoEncoder.captureKeyframes(videoEl, 8);
```

- **`AudioEncoder.capture(ctx, analyser, stream, ms?)`** — records the sound, encodes it, and returns
  what you need to display/replay it (`thumbnail`, `audioUrl`).
- **`VideoEncoder.captureKeyframes(video, frames?)`** — samples `frames` keyframes (8 by default) and
  returns **one encoding per frame** (`codes`).

## Use cases

| Modality | Example use |
|---|---|
| **Text / tabular** | classify a word, predict a house price (`TabularEncoder` + grid) |
| **Image** | visual recognition; resemblance gives "by similarity" classification |
| **Audio** | voice fingerprint / sound recognition |
| **Video** | find a video by a close keyframe (`captureKeyframes` + search) |

> 🧱 **The common ground.** All produce the **same kind of encoding** that the same grid learns — see
> [prediction](/prediction) to train/predict, and [semantic search](/semantic-search) to search by
> meaning on the text side.
