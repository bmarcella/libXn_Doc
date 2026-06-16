# Media — images & audio in the memory

Save **media** (image, audio) **with** facts and text: a photo attached to a product, a voice note to a
message, a visual to a case file. The media is stored, **described**, and **queryable** — and it is
deleted together with whatever it's attached to.

> **Image, audio and video.** Video is stored, described and searched like the rest; its
> content-based search goes through **keyframes** (see below).

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
await media.get(att.ref);            // { blob: { bytes, mime }, meta: { … } }  ← read the bytes back
```

## Attached to an entity OR a fact, deleted in cascade

The media is a **companion** of its owner (an **entity** or a **specific fact**), with `cascade`:
deleting the owner — or `media.remove(ref)` — removes the media **and** its metadata (archived, never lost).

```ts
media.mediaOf({ entity: 'produit#7' });   // [{ ref, kind: 'image' }, …]
await media.remove(att.ref);              // bytes + facts removed
```

## Searching for similar media

Indexed by its **perceptual encoding** (computed by the browser-side encoders), a media becomes
searchable by **similarity**: close images or sounds resemble each other in the index.

```ts
media.similar(queryCode, 5);   // [{ ref, sharedDepth }, …]  closest first
```

The encoding comes from [`@damba/libxn-encoders`](04-guides/architecture): `PerceptualEncoder`
(image → multi-resolution perceptual fingerprint) and `AudioEncoder` (audio → spectrogram →
fingerprint). The core stays **canvas-free**: the app computes the encoding, the memory indexes it.

### Video: similarity by keyframes

A video has no single code but a sequence of **keyframes**. Browser-side, `VideoEncoder.captureKeyframes(video, n)`
samples `n` keyframes; they're all indexed onto the same video, which then becomes findable as soon as
**one** keyframe resembles the query.

```ts
const { codes, thumbnail } = await VideoEncoder.captureKeyframes(videoEl, 8);
const att = await media.attach({ entity: 'incident#9' }, 'video',
  { bytes, mime: 'video/mp4' }, { transcript: 'the door opens' });
media.indexFrames(att.ref, codes);          // each keyframe → points to the video

media.similar(aKeyframe);                     // finds the video if a keyframe resembles
media.searchMedia({ kind: 'video', text: 'door' });   // or via facts (kind + transcript)
```

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
