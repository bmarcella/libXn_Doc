# Entity memory — similarity & prediction, without training

You record facts about people or things. **Entity memory** then answers two questions that plain fact
memory cannot: "**who resembles X?**" and "**what is X's likely missing trait?**" — **deterministically**,
**without training**, from the facts you already have.

> 💡 **The idea.** An entity recorded **once** gathers its facts. Two entities with similar facts are
> recognized as **close**. You can then **find lookalikes** and **guess a missing trait** — **0 training,
> 0 tokens**, and it is **reproducible**.

## Record & find lookalikes

```ts
import { EntityMemory } from '@damba/libxn-qpath-ml';

const mem = new EntityMemory();

mem.register('jean',   [{ role: 'ville', value: 'lyon' },  { role: 'age', value: 30 }, { role: 'metier', value: 'medecin' }]);
mem.register('pierre', [{ role: 'ville', value: 'lyon' },  { role: 'age', value: 31 }, { role: 'metier', value: 'medecin' }]);
mem.register('marie',  [{ role: 'ville', value: 'paris' }, { role: 'age', value: 70 }]);

mem.similar('jean');
//   → [ { name: 'pierre', distance: … }, { name: 'marie', distance: … } ]
//     pierre comes first: he shares the most facts with jean (smaller distance = closer).
```

## Guess a missing trait

From the closest entities that **do have** the target trait, the likely value is inferred — a **vote** for
a text value, an **average** for a number.

```ts
mem.predict('marie', 'metier');
//   → { value: 'medecin', confidence: 0.8, support: 4 }   ← inferred from marie's neighbors

// Close numeric values are treated as close (20 and 21 resemble each other):
mem.predict('marie', 'age');
//   → { value: 31, confidence: 1, support: 3 }
```

## The memory follows the facts over time

An entity's representation is **always derived from its current facts**: adding, fixing or removing a fact
updates comparisons **automatically** (nothing to resynchronize).

```ts
mem.add('marie', 'metier', 'avocate');     // a new fact
mem.remove('jean', 'ville', 'lyon');        // a correction
mem.forget('pierre');                        // forget an entity
```

## Fetch a single entity

Each entity is **independent**: you can save/load **one** without rebuilding the whole memory (ideal to
plug onto an existing fact base, entity by entity).

```ts
const record = mem.exportEntity('jean');    // { name: 'jean', facts: [...] }
//   … later, or elsewhere …
otherMem.importEntity(record);               // reloads jean alone, identically
```

## The functions

- **`register(name, facts)`** — records (or replaces) an entity with its `{ role, value }` facts.
- **`add(name, role, value)` / `remove(name, role, value?)` / `forget(name)`** — evolves an entity;
  comparisons follow.
- **`similar(name, k?)` → `{ name, distance }[]`** — the `k` **closest** entities.
- **`predict(name, role, k?)` → `{ value, confidence, support }`** — **guesses** a missing trait from
  neighbors (vote for text, average for a number).
- **`names()`** — the list of known entities.
- **`exportEntity(name)` / `importEntity(record)`** — save / load **one** entity.

## Use cases

| Need | Call |
|---|---|
| "Find me someone like **jean**" (matching, CRM, introductions) | `similar('jean')` |
| "What is marie's likely **job**?" (profile enrichment) | `predict('marie', 'metier')` |
| Group similar entities (dedup, segments) | `similar` on each entity |
| Recommend: the more facts match, the closer | the `distance` from `similar` |

> ⚠️ **It is a similarity from recorded facts.** The more relevant facts an entity has, the better the
> resemblance and the prediction. Entity memory **complements** fact memory (exact): one **files** jean,
> the other **recognizes who resembles him**.

## Going further

- [Fact extraction](/en/fact-extraction) — where the `(role, value)` facts come from.
- [Prediction (grid)](/en/prediction) — regression / classification directly on the QPath grid.
- [Companion facts](/en/companion-facts) — attach facts to an owner entity.
