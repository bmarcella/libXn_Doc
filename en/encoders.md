# Encoders — text, tables, image, audio, video

Everything in QPath becomes a sequence of **bit pairs** walking the grid. **Encoders** translate an
input (a word, a data row, an image, a sound, a video) into those pairs, **preserving similarity**: two
close inputs share a path prefix — so they land in the same place.

> 💡 **One abstraction.** Whatever the modality, the output is the same: `[number, number][]`. The grid
> then learns on it (memory, prediction, similarity) without knowing the source.

## Text & tabular data

```ts
import { SemanticEncoder, TabularEncoder, XNeuroneGrid } from '@damba/libxn';

// Text → pairs (Gray code, close characters = close bits).
const pairs = SemanticEncoder.toPairs('HELLO');

// Numeric row → pairs, FIXED column order (reproducible).
const enc = new TabularEncoder(['surface', 'rooms', 'zone'], 16 /* bits per column */);
const rowPairs = enc.encode({ surface: 80, rooms: 3, zone: 2 });
```

- **`SemanticEncoder.toPairs(data)` → `[number, number][]`** — converts any primitive (text, number,
  boolean) into bit pairs.
- **`new TabularEncoder(features, width?)`** then **`encode(row)` → `[number, number][]`** — encodes a
  `{ column: number }` row; the column order guarantees reproducibility.

## Image — multi-resolution, coarse to fine

`PerceptualEncoder` (package `@damba/libxn-encoders`) encodes an image at **several resolutions**
(4×4 → 8×8 → 16×16): the first bits capture the overall shape, the next ones the detail. Two cat images
therefore share their **first** bits → free generalization.

```ts
import { PerceptualEncoder } from '@damba/libxn-encoders';

const pairs = await PerceptualEncoder.encodeFromFile(file);   // from an <input type="file">
const grid = new XNeuroneGrid();
grid.train(pairs, 'cat');

// Another cat image lands in the same place.
const queryPairs = await PerceptualEncoder.encodeFromImage(img);
grid.predictClass(queryPairs);                                 // → { label: 'cat', … }
```

- **`encodeFromFile(file)` / `encodeFromImage(img)` / `encodeFromSource(src)`** — image → bit pairs
  (coarse-to-fine). `encodeFromSource` accepts a canvas / video / `ImageBitmap`.

## Audio & video

```ts
import { AudioEncoder, VideoEncoder } from '@damba/libxn-encoders';

// Audio: mic → spectrogram → same perceptual bits as an image.
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaStreamSource(stream).connect(analyser);
const { pairs, thumbnail, audioUrl } = await AudioEncoder.capture(ctx, analyser, stream, 2000);

// Video: N keyframes spread over the duration, each encoded.
const { codes, thumbnail: vthumb } = await VideoEncoder.captureKeyframes(videoEl, 8);
```

- **`AudioEncoder.capture(ctx, analyser, stream, ms?)` → `{ pairs, thumbnail, audioUrl }`** — records,
  builds a spectrogram, encodes it like an image; `thumbnail`/`audioUrl` for the UI.
- **`VideoEncoder.captureKeyframes(video, frames?)` → `{ codes, thumbnail, durationMs }`** — samples
  `frames` keyframes (8 by default), returns **one encoding per frame** (`codes`).

## Use cases

| Modality | Example use |
|---|---|
| **Text / tabular** | classify a word, predict a house price (`TabularEncoder` + grid) |
| **Image** | visual recognition; hierarchical similarity gives "by resemblance" classification |
| **Audio** | voice fingerprint / sound recognition (spectrogram → bits) |
| **Video** | find a video by a close keyframe (`captureKeyframes` + search) |

> 🧱 **The common ground.** All produce `[number, number][]` that the same grid learns — see
> [prediction](/prediction) to train/predict, and [semantic search](/semantic-search) to search by
> meaning on the text side.
