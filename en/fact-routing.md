# Fact routing

Once a fact has been **extracted** from text, one question remains: **how should it be stored?** An ordinary
fact goes into memory; a fact attached to a parent becomes a **companion** (and retracts in cascade); a
sensitive value goes to the **vault**; an attachment becomes a **media** item. Fact routing **decides that
storage type** for each candidate fact, plus the associated **flags** (cascade, locked, structural).

> 💡 **Route the storage, not understand the sentence.** [Intent routing](/en/intent-routing) answers
> "*what does the user want?*" (one decision per message). Fact routing answers "*how do I store this fact?*"
> (one decision **per fact**, downstream of extraction). The two are complementary.

## The principle: classify a candidate

For each candidate fact, the router assigns:

- a **type** from a small vocabulary (by default `fact`, `companion`, `vault`, `media`), an **exclusive**
  decision;
- independent **flags** (`cascade`, `closed`, `major`…), a **multi-label** decision.

The input signal is the fact's **predicate** (also available at ingestion time), encoded in QPath's
**directional representation**. A small directional network, **trained** on labeled examples, infers the type
and flags. At inference it is **deterministic**, **0 tokens**, and the parameter count stays **fixed**,
independent of input length.

## Routing a fact

```ts
import { FactRouter, TextQuatEncoder } from '@damba/libxn-qpath-ml';

const enc = new TextQuatEncoder();                     // text -> directional representation
const TYPES = ['fact', 'companion', 'vault', 'media']; // class index = position

const router = new FactRouter(TYPES.length, { hidden: 12, numFlags: 3, act: 'identity' });
router.fit(samples, { epochs: 300, lr: 0.01 });        // labeled samples: { quats, type, flags }

const r = router.predict(enc.quatsOf('a_image'));
TYPES[r.type];   // -> 'media'
r.flags;         // -> flag probabilities [cascade, closed, major]
```

- **`predict(quats)`** returns `{ type, typeProbs, flags }`; **`predictType(quats)`** returns the type index only.
- **`fit(samples, opts)`**: training by gradient descent, seeded RNG so it is reproducible.
- The type and flag vocabularies are **free**: adapt them to the domain.

## Save and reuse the model

A trained model is a **small self-contained JSON**: persist it, then reload it identically.

```ts
const json = router.toJSON();             // router weights
const ready = FactRouter.fromJSON(json);  // same predictions, ready for inference
```

At ingestion, chain it after extraction: for each candidate fact, predict the type, then write through the
right path (normal memory, companion cascade, vault, media).

## Fact routing vs intent routing

| | Intent routing | Fact routing |
|---|---|---|
| Question | "what does the user want?" | "how do I store this fact?" |
| Input | the whole message | a candidate fact (its predicate) |
| Output | an action (`send_email`, `wallet`…) | a storage type (`vault`, `media`…) + flags |
| Place | **front** of the pipeline (branch choice) | **after** extraction (storage) |
| Cardinality | 1 per message | N per message |

> 🔎 **Context decides the companion.** Whether a fact is a *companion* depends mostly on the **ingestion
> context** (is there a parent block?), not the predicate alone. So the router best distinguishes `media` and
> `vault`; the companion attachment is confirmed by context.

## What it is for

| Situation | How |
|---|---|
| Send a sensitive value to the vault without a keyword list | `vault` type learned from examples |
| Recognize an attachment as media | `media` type (media-link predicate) |
| Decide cascade / locking / structural importance | multi-label flags |
| Keep a **deterministic**, **token-free** decision at ingestion | inference from the serialized model |
