# Encoders — text, tables, image, audio, video

## The problem

A QPath grid only memorizes, compares and predicts on a shared **internal representation**. But the world
arrives in heterogeneous forms: a word, a table row, a photo, a sound, a video. Without a conversion step,
each modality would live in its own silo and nothing could be compared. **Encoders** solve this: they turn
any input into the **same shape**, while **preserving similarity** (two close inputs land in the same
place). The grid then learns on it without knowing the source.

> 💡 **One abstraction.** Whatever the modality, the output has the same shape. That's what lets you mix
> text, image and sound in **one memory**.

## Text & tabular data

**The problem.** Classifying a word or predicting a numeric value (a price, a score) first requires putting
text and numbers into the grid **reproducibly**: the same input must always give the same encoding.

```ts
import { SemanticEncoder, TabularEncoder } from '@damba/libxn';

const encoded = SemanticEncoder.toPairs('HELLO');           // text → encoding

const enc = new TabularEncoder(['surface', 'rooms', 'zone']);
const row = enc.encode({ surface: 80, rooms: 3, zone: 2 });  // row → encoding
```

`SemanticEncoder.toPairs` encodes a primitive (text, number, boolean) keeping close values close; text is
handled character by character. `TabularEncoder` encodes a row column by column, in the **fixed order**
declared at construction: that frozen order is what makes two rows of the same dataset comparable and
reproducible.

**Use case.** Predict a house price: `new TabularEncoder(['surface','rooms','zone'])`, encode each row,
train the grid, then predict the price of an unseen property. See [prediction](/en/prediction).

## Image — coarse to fine

**The problem.** You want to recognize or group images **without a massive training dataset**.
`PerceptualEncoder` (`@damba/libxn-encoders`) encodes an image **coarse to fine** — the overall shape
first, the detail next. Two cat photos therefore resemble each other from the earliest levels, giving
**free generalization**: resemblance alone is enough to classify.

```ts
import { PerceptualEncoder } from '@damba/libxn-encoders';
import { XNeuroneGrid } from '@damba/libxn';

const encoded = await PerceptualEncoder.encodeFromFile(file); // from an <input type="file">
const grid = new XNeuroneGrid();
grid.train(encoded, 'cat');

const query = await PerceptualEncoder.encodeFromImage(img);
grid.predictClass(query);                                     // → { label: 'cat', … }
```

Three entry points depending on the source: `encodeFromFile` (a file, e.g. from an `<input type="file">`),
`encodeFromImage` (an image already in the DOM), and `encodeFromSource` (a generic source — canvas, video,
`ImageBitmap`), the common brick that image and video both go through.

**Use case.** Visual "by similarity" recognition: train the grid with a few labeled images, then classify
an unseen image by resemblance, with no heavy training phase.

## Audio & video

**The problem.** Sound and video are temporal: you must **sample** then encode them to memorize and
retrieve them (voice fingerprint, finding a video by a close frame).

```ts
import { AudioEncoder, VideoEncoder } from '@damba/libxn-encoders';

const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaStreamSource(stream).connect(analyser);
const { encoding, thumbnail, audioUrl } = await AudioEncoder.capture(ctx, analyser, stream, 2000);

const { codes, thumbnail: vthumb } = await VideoEncoder.captureKeyframes(videoEl, 8);
```

`AudioEncoder.capture` records the mic sound (via the Web Audio API) for a given duration, encodes it, and
returns what you need to display and replay it (a spectrogram thumbnail and a replayable URL).
`VideoEncoder.captureKeyframes` spreads a number of keyframes (8 by default) over the video's duration and
returns **one encoding per frame**, plus a thumbnail.

**Use case.** Find a video from a close image: index each video's `codes`, then search for the keyframe
most resembling a query image.

## Summary

| Modality | Key function | Use case |
|---|---|---|
| **Text / tabular** | `SemanticEncoder.toPairs` · `TabularEncoder` | classify a word, predict a house price |
| **Image** | `PerceptualEncoder.encodeFrom*` | visual recognition by similarity |
| **Audio** | `AudioEncoder.capture` | voice fingerprint, sound recognition |
| **Video** | `VideoEncoder.captureKeyframes` | find a video by a close keyframe |

> 🧱 **The common ground.** All produce the **same kind of encoding** that the same grid learns — see
> [prediction](/en/prediction) to train/predict, and [semantic search](/en/semantic-search) to search by
> meaning on the text side.
