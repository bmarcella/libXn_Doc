# Conversation topics

In a long conversation, you jump from one topic to another and back. `TopicSegmenter` **groups
messages by topic** — with no LLM call, **deterministically and replayably** — to give the model only
the **relevant context** (not the whole noisy history).

> 💡 **Why.** Mixing "planes" and "cars" in one context degrades answers. By isolating the current
> topic, you keep a clean context and save tokens.

## Assign messages

```ts
import { TopicSegmenter } from '@damba/libxn';

const seg = new TopicSegmenter();

seg.assign('Tell me about planes', 1000);            // { isNew: true,  topic.label: 'plane' }
seg.assign("An airliner's cruising speed?", 2000);   // { isNew: false, same topic }
seg.assign('What about electric cars?', 3000);       // { isNew: true,  new topic }
seg.assign('How many passengers on a plane?', 4000); // finds the 'plane' topic again
```

- **`assign(text, now?)` → `TopicAssignment`** — sorts the message into the closest existing topic
  (vocabulary sharing) **or** creates one; returns `{ topic, isNew }`. On a tie, **the current topic
  wins** (no ping-pong).
- **`propose(text)` → `TopicProposal`** — **pure** version (changes nothing): where this message would
  go, and with what confidence — useful to arbitrate before committing.

## Read, label, replay

```ts
seg.topics();                 // active topics, most recent first
seg.active();                 // last assigned topic
seg.setMeta(id, { label: 'Aeronautics', description: 'All about planes' });
seg.remove(id);               // the host then excludes its messages from the LLM context
```

- **`topics()` / `active()`** — the list of `ConversationTopic` (`id`, `label`, `keywords`,
  `messageCount`…) and the current topic.
- **`setMeta(id, { label?, description? })`** — labels a topic (survives recompute).
- **`replayAssign(text, knownTopicId?, now?)`** — on **reload**, replays assignments respecting
  already-persisted decisions: same `id`s (`t0`, `t1`…) → reproducible with no decision store.

## Use cases

| Situation | Benefit |
|---|---|
| Multi-topic chat without contamination | give the LLM only the **current topic** |
| "Tabbed" conversational UI | show `topics()`, click → switch context |
| Resume a conversation after reload | `replayAssign` (stable ids, deterministic) |
| Fine arbitration (ambiguous topic) | `propose()` then `commitTo(text, topicId)` |

> ⚙️ **Zero tokens.** Segmentation relies on a lexical score (weighted keywords, FR/EN stopwords), not
> an LLM — instant and **replayable**.
