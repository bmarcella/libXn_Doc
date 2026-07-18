# Media — images & audio in the memory

Save **media** (image, audio) **with** facts and text: a photo attached to a product, a voice note to a
message, a visual to a case file. The media is stored, **described**, and **queryable** — and it is
deleted together with whatever it's attached to.

> **Image, audio and video.** Video is stored, described and searched like the rest; its
> content-based search goes through **keyframes** (see below).

> 🎯 **Use case.** A photo attached to a product, a voice note to a message, a visual to a folder: the media
> is stored, described by facts (so it's **queryable**), and deleted **with** whatever it's attached to. The
> problem it solves: keep the image or sound **in the same memory** as the text, retrievable and governed by
> the same rules (including cascade right-to-be-forgotten).

## The principle: reference + metadata as facts, bytes in a store

A fact stores a **string**, not bytes. So a media = a **reference** (content hash) + **metadata** as
facts; the bytes go into an injected **`MediaStore`** (in-memory, Postgres, filesystem, S3…). The
content hash **deduplicates** automatically (same media = same reference).

```ts
import { MediaFacts, MediaIndex, InMemoryMediaStore } from '@damba/libxn';

const media = new MediaFacts(kb, new InMemoryMediaStore(), new MediaIndex());

// Attach an image to a product, with a description (queryable text) + its perceptual encoding.
const att = await media.attach(
  { entity: 'produit#7' }, 'image',
  { bytes, mime: 'image/png' },
  { alt: 'Cat on a couch', width: 1024, height: 768 },
  code,                              // perceptual encoding (see "Searching for similar media")
);

kb.ask('produit#7', 'a_image');      // [att.ref]            ← the link, as a fact
kb.ask(att.ref, 'alt');              // ['cat on a couch']   ← findable text (RAG / search)
await media.get(att.ref);            // { blob: { bytes, mime } | null, meta: { … } }  ← read the bytes back (blob is null if missing from the store)
```

**`new MediaFacts(kb, store, index?)`** — wires the media layer onto your memory:

| Argument | Role | Default |
|---|---|---|
| `kb` | the `KnowledgeBase` holding the **link facts** (`owner → a_image/a_audio/a_video`) and the **metadata** (mime, alt, transcript…) | required |
| `store` | the `MediaStore` holding the **bytes**, addressed by content hash (`InMemoryMediaStore` in tests; Postgres/FS/S3 in production) | required |
| `index?` | a `MediaIndex` for perceptual **similarity search**. **Omitted** → `attach` indexes nothing and `similar()` returns `[]` | `undefined` |

**`media.attach(owner, kind, blob, meta?, code?)`** — stores the bytes, writes the link fact (a `cascade` companion) and the global metadata. Returns `{ ref, kind, ownerRef }` (`ref` = content hash, reused everywhere):

| Argument | Role | Default |
|---|---|---|
| `owner` | the **owner**: `{ entity: 'produit#7' }` (an entity) **or** `{ fact: { s, p, o } }` (a specific fact) | required |
| `kind` | the **type**: `'image' \| 'audio' \| 'video'` — picks the link predicate (`a_image`/`a_audio`/`a_video`) | required |
| `blob` | the bytes: `{ bytes: Uint8Array, mime: string }` | required |
| `meta?` | global metadata: `{ mime?, alt?, transcript?, width?, height?, durationMs? }`. `alt`/`transcript` are **queryable text** (case preserved) | `{}` |
| `code?` | the **perceptual encoding** (`[number, number][]`, quats). Provided **and** an `index` present → the media is indexed for `similar()` | `undefined` |

> 💡 Metadata is **global to the media** (written once, on the first `attach`) because the same `ref` can be shared by several owners. The effective **type** instead comes from the link fact — reliable even for a media shared under multiple types.

**`media.get(ref)`** — a single argument, the media **reference**. Returns `{ blob, meta }`: `blob` is `{ bytes, mime }` or **`null`** if the bytes are missing from the store (purged, or never arrived), and `meta` is a `predicate → value` map (the display case of `alt`/`transcript` is restored).

## Attached to an entity OR a fact, deleted in cascade

The media is a **companion** of its owner (an **entity** or a **specific fact**), with `cascade`:
deleting the owner — or `media.remove(ref)` — removes the media **and** its metadata (archived, never lost).

```ts
media.mediaOf({ entity: 'produit#7' });   // [{ ref, kind: 'image' }, …]
await media.remove(att.ref);              // bytes + facts removed
```

**`media.mediaOf(owner)`** — one argument, the **owner** (same shape as `attach`: `{ entity }` or `{ fact }`). Reads the **link facts** (robust to sharing) and returns the list `{ ref, kind }` of attached media. (Not to be confused with `ownersOf(ref)`, which does the reverse: the owners of a given media.)

**`media.remove(ref)`** — one argument, the **reference**. **Permanently** removes the media: all its links + metadata (archived, never lost) **and** its bytes, including nested companions. Returns `{ retracted, bytesDeleted }` (count of archived facts, and `true` if the bytes were present).

> ⚠️ `remove` is **unconditional**: it erases the media for **all** its owners. To remove the media from a **single** owner (and delete the bytes only if no link remains), use `media.detach(owner, ref)` instead, which returns `{ detached, removed }`.

## Searching for similar media

Indexed by its **perceptual encoding** (computed by the browser-side encoders), a media becomes
searchable by **similarity**: close images or sounds resemble each other in the index.

```ts
media.similar(queryCode, 5);   // [{ ref, sharedDepth }, …]  closest first
```

**`media.similar(code, limit?)`** — search by shared perceptual prefix:

- `code` — the query's **perceptual encoding** (`[number, number][]`, quats), produced by the same encoder as the indexed media.
- `limit?` — maximum number of results (**default `5`**).

Returns an array of `MediaHit`: `{ ref, sharedDepth }`, where `sharedDepth` is the **length of the quat prefix shared** with the query (larger = closer). Without a `MediaIndex` at construction, returns `[]`.

The ranking is **deterministic** and **"closest first"**: at equal shared perceptual prefix, the most
exact matches come out first — which matters when you cap the number of results. Indexing the same media
twice creates no duplicate, and **deleting a media also removes it from the index** (no more "ghost"
media that would keep showing up).

The encoding comes from [`@damba/libxn-encoders`](04-guides/architecture): `PerceptualEncoder`
(image → multi-resolution perceptual fingerprint) and `AudioEncoder` (audio → spectrogram →
fingerprint). The core stays **canvas-free**: the app computes the encoding, the memory indexes it.

### Video: similarity by keyframes

A video has no single code but a sequence of **keyframes**. Browser-side, `VideoEncoder.captureKeyframes(video, n)`
samples `n` keyframes; they're all indexed onto the same video, which then becomes findable as soon as
**one** keyframe resembles the query.

```ts
import { VideoEncoder } from '@damba/libxn-encoders';

const { codes, thumbnail } = await VideoEncoder.captureKeyframes(videoEl, 8);
const att = await media.attach({ entity: 'incident#9' }, 'video',
  { bytes, mime: 'video/mp4' }, { transcript: 'the door opens' });
media.indexFrames(att.ref, codes);          // each keyframe → points to the video

media.similar(aKeyframe);                     // finds the video if a keyframe resembles
media.searchMedia({ kind: 'video', text: 'door' });   // or via facts (kind + transcript)
```

**`VideoEncoder.captureKeyframes(video, frames?)`** (package `@damba/libxn-encoders`, browser layer):

- `video` — an `HTMLVideoElement` whose **metadata is loaded** (the `loadedmetadata` event), otherwise duration/dimensions are unknown.
- `frames?` — number of keyframes to sample, spread at the middle of equal segments (**default `VideoEncoder.DEFAULT_FRAMES` = 8**).

Returns `{ codes, thumbnail, durationMs }`: `codes` is one perceptual encoding **per** keyframe (`Array<[number, number][]>`, to pass straight to `indexFrames`), `thumbnail` a PNG dataURL of the first keyframe, and `durationMs` the duration in milliseconds.

**`media.indexFrames(ref, frameCodes)`** — indexes several encodings all pointing to the **same** video:

- `ref` — the video's reference (returned by `attach`).
- `frameCodes` — the keyframe encodings (`Array<[number, number][]>`, typically the `codes` from `captureKeyframes`).

Returns nothing (`void`). Without a `MediaIndex` at construction, it is a no-op.

**`media.searchMedia(query?)`** — search **via facts** (not by similarity), all criteria combined with **AND**:

| `query` field | Role | Default |
|---|---|---|
| `text?` | substring searched in `alt` **or** `transcript` (case-insensitive) | — (no text filter) |
| `kind?` | type `'image' \| 'audio' \| 'video'` — filtered on the **link predicate** (reliable for a multi-type media) | — (all types) |
| `owner?` | exact owner key: entity name, or fact ref (`fact:<id>`) | — (all owners) |

Called with no argument (`searchMedia()`), it returns **all** media. The result is a list of `{ ref, kind }`.

Search by **type** (image / audio / video) stays reliable even for a media **shared** across several
owners or attached under multiple types: the type comes from the **attachment link**, not from a piece
of metadata written only once.

## The honest boundary

- **Content** search stays **coarse** (perceptual fingerprint) or **textual** (alt / transcript) — not
  fine-grained understanding without a dedicated model.
- **The bytes don't live in the memory**: they're in the injected `MediaStore`; the KB only holds the
  **reference** and the **description**. That's what keeps the core light and the memory fully queryable.

---

::: tip Going further
Durable fact persistence via [Postgres](persistence); a durable `MediaStore` adapter (Postgres `bytea`,
filesystem, S3, IndexedDB) plugs in through the same port.
:::
