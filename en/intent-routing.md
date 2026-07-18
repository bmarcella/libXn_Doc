# Semantic intent routing

Before answering, you need to know **what a message wants**: store a fact, ask a question, add a
reminder, send an email, check a balance. `@damba/libxn-intent` infers that **intent** quickly, **without
domain keywords** and without a heavy model. It acts as a switchboard: it steers a message to the right
capability, or stands aside when it is unsure.

> 💡 **No magic word list.** A router built on "if the text contains *balance* then…" is brittle: it
> misses "how much is on my account" and trips on "balance an email". Here we compare the **shape** of a
> message to examples, not exact words.

> 🎯 **Use case.** Three messages arrive: "Marie lives in Lyon", "where does Marie live?", "remind me to
> call Marie". The first must be **stored**, the second **queried** (writing nothing), the third turned into
> a **reminder**. The intent router tells them apart before any handling. The problem it solves: send each
> message to the right capability, otherwise a question could pollute memory or trigger a needless LLM call.

## The idea: shape, not words

The contextualizer files each intent under a few **examples**, then compares a new message to those
examples along two signals:

- **function words** (determiners, prepositions, interrogatives, pronouns: "which", "to", "my", "is
  it"…) that carry the **structure** of a request, regardless of topic;
- character **trigram similarity**, robust to typos and variants.

The weighted nearest neighbour wins, and the decision is **confidence-gated**: if the top score is too
low or too close to the runner-up, the router returns `unknown` rather than guessing. It is QPath-native,
deterministic, with zero external dependency.

## Routing a message

```ts
import { SemanticContextualizer, DEFAULT_INTENTS } from '@damba/libxn-intent';

const router = new SemanticContextualizer();          // default intent set

const r = await router.route('how much is on my account?');
//  → { intent: 'wallet', confidence: 0.71, via: 'qpath', alternatives: [...] }

const r2 = router.routeOffline('balance an email to Sophie');
//  → { intent: 'send_email', via: 'qpath' }   (never classed as 'wallet' despite the word "balance")
```

- **`route(text)` → `Promise<RouteResult>`** — classifies the message; consults the LLM port **only**
  when ambiguous (see below).
- **`routeOffline(text)` → `RouteResult`** — fully deterministic (no external call).
- **`RouteResult`** = `{ intent, confidence, via: 'qpath' | 'llm' | 'unknown', alternatives }`.

The intent set is a plain list of `{ name, examples[] }`. The default covers chitchat, identity,
fact write/read, yes/no reasoning, transforms, email, notes, agenda, web search, wallet. Replace or
extend it at construction:

```ts
import { type Intent } from '@damba/libxn-intent';

const intents: Intent[] = [
  ...DEFAULT_INTENTS,
  { name: 'book_room', examples: ['book a room for tomorrow', 'i want a room at 2pm'] },
];
const router = new SemanticContextualizer({ intents });
```

## The LLM, as backup and teacher

The `LlmIntentPort` is **optional** and steps in only on **ambiguity** (when the deterministic side is
not confident). Crucially, what it decides is **learned**: the router adds the example to the chosen
intent (distillation) with a cautious weight, so it needs the LLM **less and less**.

```ts
const router = new SemanticContextualizer({
  llm: {
    async disambiguate(text, candidates) {
      // return { intent, confidence } among `candidates`, or null
      return { intent: 'send_email', confidence: 0.8 };
    },
  },
});

await router.route('pass a note to Paul');          // ambiguous -> LLM decides, router remembers
router.learn('send_email', 'pass a note to Paul');  // (explicit learning is also possible)
```

- **`disambiguate(text, candidates)`** — the only LLM entry point; the port decides how to implement it
  (server proxy, local model, a rule). Absent, the router stays **purely deterministic**.
- **`learn(intent, example)`** — adds an example on the fly, no restart.

## Tuning confidence

The router is **cautious by default**: `unknown` beats a wrong route.

| Option | Role | Default |
|---|---|---|
| `absThreshold` | minimum score to be "confident" | `0.4` |
| `marginThreshold` | minimum gap with the 2nd intent | `0.04` |
| `structWeight` | weight of function words vs trigrams | `0.45` |
| `provisionalWeight` | weight of an LLM-learned example (< 1 = caution) | `0.7` |

## What it is for

| Situation | How |
|---|---|
| Disambiguate an over-greedy trigger ("**balance** an email" ≠ account balance) | let the handler match, then **verify** the intent and **veto** it if the router disagrees (guardrail) |
| Steer to the right capability when no deterministic rule decides | `route()` above a high confidence threshold |
| Cover variants/typos without listing keywords | examples per intent + shape similarity |
| Improve with use | the LLM only resolves ambiguity and **teaches** the deterministic side |

> 🔎 **A guardrail rather than the sole switchboard.** The safest pattern is to keep deterministic logic
> up front and use the router as a **second opinion**: it confirms or objects, but decides alone only
> when clearly confident.
