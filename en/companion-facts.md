# Companion facts & sections

Often, a block of facts **belongs** to something: a person's profile, a document's metadata, an
invoice's line items. `CompanionFacts` **attaches** these facts to an **owner** (an entity or a precise
fact), to read them as a block and **retract them together**.

> 💡 **Still ordinary facts.** A companion stays a normally queryable triple; it just carries a link to
> its owner — and, if you want, a **cascade** (it disappears with the owner).

## Attach a profile

```ts
import { CompanionFacts } from '@damba/libxn';

const comp = new CompanionFacts(kb);
const owner = { entity: 'bigvai' };

await comp.attach(owner, 'bigvai', 'address', 'port-au-prince');
await comp.attach(owner, 'bigvai', 'born_on', '1991-01-01');

comp.profileOf(owner);     // { address: ['port-au-prince'], born_on: ['1991-01-01'] }
kb.ask('bigvai', 'address'); // → ['port-au-prince']   (a companion is a normal fact)
```

- **`attach(owner, s, p, o, opts?)` → `Promise<string>`** — writes the fact **and** tags it as a
  companion of the owner (returns its id). `opts.cascade` ties its fate to the owner's.
- **`tag(owner, s, p, o)`** — tags an **already existing** fact as a companion (without rewriting it).
- **`profileOf(owner)` → `Record<string, string[]>`** — the structured profile `{ predicate: [values] }`.
- **`companionsOf(owner)` → `EnumeratedFact[]`** — all of the owner's facts (follows aliases if the
  entity was merged via `same_as`).

## A fact's metadata

The owner can be **a precise triple** — for example, describing an account, not the person:

```ts
await kb.tell('bigvai', 'has', 'account_12345');
const account = { fact: { s: 'bigvai', p: 'has', o: 'account_12345' } };

await comp.attach(account, 'account_12345', 'opened_on', '2020-06-01', { cascade: true });
await comp.attach(account, 'account_12345', 'balance', '1000', { cascade: true });
```

- **`CompanionOwner`** = `{ entity: string }` (entity profile) **or** `{ fact: { s, p, o } }` (a fact's
  metadata). **`ownerOf(s, p, o)`** finds a companion's owner.

## Retract as a block

```ts
comp.retractOwner({ entity: 'document:cv' });   // owner + `cascade` companions (one level)
comp.retractTree({ entity: 'invoice:123' });    // the whole tree (companion of a companion…)
```

- **`retractOwner(owner, reason?)` → `{ retracted }`** — retracts the owner and its `cascade` companions
  (one level).
- **`retractTree(owner, reason?)` → `{ retracted }`** — retracts the **whole tree recursively** (a
  companion can itself be an owner). Everything stays **archived** (undoable).

## Use cases

| Situation | Benefit |
|---|---|
| A person's **profile** (address, birth, contacts) grouped and queryable | `attach` + `profileOf` |
| **Document section**: all of a file's facts, retractable together | owner `document:<name>`, `cascade:true` |
| **Metadata** of a fact (account → opening date, balance) | owner `{ fact }` |
| **Nested** data (invoice → line items) deleted at once | `retractTree` |

> 🧩 **QPath convention.** Ingesting a document attaches each extracted fact to the document
> (`document:<name>`, `cascade:true`): all of a file's facts form a **section** that cascades on
> retraction. See also [provenance](/fact-provenance) and [fact types](/fact-types).
