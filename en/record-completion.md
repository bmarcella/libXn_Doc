# Proposing missing values

A record arrives incomplete: an email without a domain, a missing badge identifier, an empty city.
Damba **proposes a value** for each empty field, with a **confidence** and a **readable reason**, and
**abstains** when it is not sure. Nothing is written without your consent.

## Where a proposal comes from

Two sources, tried in this order:

1. **The shape of values.** Many fields follow a regular shape: an identifier built from another one
   (`emp:12` gives `badge:emp:12`), a domain taken from a company, a compiled file that follows its
   source file, a code. When several distinct records attest the same shape, it is replayed on the
   incomplete record.
2. **Similar records.** Otherwise, Damba looks at the records most similar to this one on their other
   fields, and proposes the value they agree on.

Confidence combines the closeness of similar records and their agreement (or the share of records
attesting the shape). The reason says, in words, which of the two sources spoke.

## Safeguards

- **Never against a decided value.** A proposal that would contradict a closed (decided) value is
  discarded, and the discard is logged.
- **Abstention by design.** Below the confidence threshold, the field stays empty and the abstention is
  shown, with no invented value. This is typical of **noisy numeric measurements**, where neither a shape
  nor a neighborhood decides.
- **A shape is never learned from numbers.** A "this measure gives that one" correspondence learned on
  numeric values is never replayed.
- **The most specific rule wins** when several shapes apply.
- **Read-only.** Computing proposals does not modify memory; applying one goes through the ordinary
  record edit path.

## Measurement

Held-out records, one field hidden per record, compared with the most frequent value of the field:

| Dataset | Gain over the most frequent value | Contradictions |
| --- | --- | --- |
| Structured records (keys, domains, emails, codes) | **+77 points** | 0 |
| Employee records (team, city, level, badge…) | **+30 points** | 0 |
| Noisy numeric measurements | no gain: Damba abstains instead of inventing | 0 |

## In the application

In the Records tab, Cards view, the **"Propose missing values"** button shows, for each empty field, the
value, its confidence and its reason, with **Apply**, or the abstention.

## Using it in code

```ts
import { Recombiner, makeRng } from '@damba/libxn-generative';

const rec = new Recombiner(kb, makeRng(42));
const proposals = rec.proposeMissing(
  'emp:12',
  [{ p: 'team', o: 'data' }],
  ['team', 'city', 'badge'],
);
// Map per field: { kind: 'proposal', value, confidence, … } or a reasoned abstention.
// A field that is already filled does not appear.
```

## Memory autocompletion

Same spirit, in the chat: as you type, Damba **completes subjects it already knows** (a person, a
customer, a record) below the input box. It only proposes subjects **present in memory**, never an
invented name. Completions are learned in the background without slowing typing.

## Where it fits

It is one form of [generative deduction](/en/generative-deduction): producing structured, verified
output, and staying silent rather than guessing. See also [flow synthesis](/en/flow-synthesis).
