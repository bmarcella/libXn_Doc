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

## Closing a topic

A topic closes by itself: the conversation moves on and never comes back. That moment is the one
worth naming, because it is the only one where you can summarize without interrupting.

```ts
seg.isClosed(id);                                  // has this topic cooled down?
seg.closedTopics();                                // closed topics, COLDEST first
seg.closedTopics({ gap: 5, minMessages: 3 });      // tunable thresholds
```

- A topic is **closed** when at least `gap` consecutive messages went to **other** topics **and** it
  holds at least `minMessages` messages. Defaults: `{ gap: 3, minMessages: 2 }`.
- Both conditions matter. Without the first you close a **hot** topic — the one being discussed right
  now. Without the second you close a one-off question that carries nothing worth keeping.
- **Replayable**: the verdict is rebuilt by `replayAssign` in message order, so it is the same after a
  reload. Nothing new to persist.
- `isTopicClosed({ messageCount, lastIndex }, currentIndex, opts)` is the **pure** decision, outside
  the class: two numbers are enough to test it.

## Factualizing a closed topic

A summary is a string: you cannot query it, you cannot retract it, and it does not say where it came
from. `TopicFactualizer` turns a closed topic into an **entity** and its map into **ordinary facts** —
queryable, dated, tied to the exact sentence they came from.

```ts
import { buildTopicFacts, factualiseTopic, topicSubject } from '@damba/libxn';

const facts = buildTopicFacts({
  projectId: 'p1', topicIndex: 2, label: 'Laval lease',
  messages: [{ id: 'm1', text: '…', at: 1_700_000_000_000 }],
  summary: 'The lease ends in March.',          // written by a model or by a human
  decided: ['renew for one year'],
  knownEntities: ['Marie Tremblay'],
});

await factualiseTopic(kb, companions, { /* same input */ });
```

The map of a thread, as reserved predicates on the subject `topic:<project>#<n>`: `is`
(`conversation_topic`), `label`, `summary`, `decided`, `open_question`, `mentions`, `from_message`,
`at`, `until`, plus the `factualised` witness.

- **It infers nothing.** `summary`, `decided` and `open_question` are written only if the caller
  supplies them, and they keep the `llm` origin: readable as **unverified**. What can be computed
  (label, time bounds, source messages, cited entities) is computed.
- **It cites only what is known.** `mentions` keeps only entities the memory already knows: minting an
  entity from a word in the thread would manufacture ghost subjects.
- **It never reads a secret message**, and a segment with no readable message creates no entity.
- **It runs once.** The `factualised` witness guarantees it — without it, every pass would add one more
  summary.
- **It is undone in one move.** The facts are cascading companions of `conversation:<project>#<n>`:
  retracting the owner takes them all.
- **Never `closed`, never `major`.** These are statements produced about a discussion thread, not human
  decisions nor the backbone of the memory.

> ⚠️ **Deliberate scope.** This module writes facts **about the conversation**, never **about the
> world**. Claims made in the thread ("the rent is 880 dollars") go through the usual write pipeline,
> with its preview and human validation.
