# Compact memory (lexkey)

`@damba/libxn-lexkey` gives every word a **stable, content-addressed identity**, for two concrete
wins: a **more compact** memory (each term stored once) and one that is **mergeable** across machines
without coordination. Zero dependencies, runs identically in the browser and on the server.

Three layers, separated by what changes over time and what doesn't:

| Layer | Role | Changes? |
|---|---|---|
| **Identity** | a word's address, derived from its content alone | no (immutable) |
| **Prior** | a measured belief (a language's frequency) | yes (observed) |
| **Resolution** | disambiguate a surface form at read time | stateless |

## A word's identity

A word's address is a 128-bit fingerprint computed from its normalized form. Two properties follow:

- **Deterministic and universal.** The same word always yields the same address, on any machine. Two
  memories that never communicated compute the same address for the same word.
- **Independent of any belief.** Re-estimating a prior, changing context, none of it moves an address.
  That is what makes it usable as a **stable identifier**.

```ts
import { contentHash, TermInterner } from '@damba/libxn-lexkey';

contentHash('Paris', 'en'); // always the same 128-bit fingerprint
```

## Store identifiers, not repeated words

The same memory repeats the same terms everywhere (one subject, one predicate recur across hundreds of
facts). `TermInterner` stores each term **once** and references the other occurrences by a **compact
identifier**, while keeping the exact displayable word.

```ts
const terms = new TermInterner();
const ids = terms.internTriple('Paris', 'located_at', 'France'); // [0, 1, 2]
terms.internTriple('Lyon', 'located_at', 'France');              // 'located_at' and 'France' reused
terms.resolveTriple(ids);                                        // ['Paris','located_at','France']
```

Two handles, each useful: a local, compact **identifier** (the stored "number") and a global, stable
**address** (for merging). The readable word is **always** kept: the address is irreversible, the
memory stays auditable.

## Merge two memories by address

Because the same word has the same address everywhere, two memories merge **without coordination**: you
match terms by their address and rewrite the references. No central catalog, no prior agreement.

```ts
const remap = memoryA.merge(memoryB); // matches by address, returns the id mapping
```

## Compact persistence

A `SnapshotCodec` deduplicates the persisted memory: repeated terms **and** repeated provenance
metadata are stored once. Reconstruction is **exact** (words, case, accents preserved); a legacy-format
snapshot reloads without conversion. On real memory, the size reduction ranges from about **10 to 35 %**
depending on size and data richness.

> **What lexkey is not.** An address does not replace text: it is a fingerprint, not a reversible
> compression. QPath still stores and displays the word. lexkey provides stable identity, interning and
> merging, not a secret encoding of words.
