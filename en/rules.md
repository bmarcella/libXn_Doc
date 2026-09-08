# Rules & induction

Beyond facts, QPath reasons with **rules**: "if … then …". An added rule automatically **derives** new
facts, and each derived fact keeps its **provenance** ("why do I know this?"). Better still: the engine
can **discover** plausible rules from data, and accept a rule dictated in **natural language**.

> 💡 **Deterministic and auditable.** No magic derivation: you can always ask where a fact comes from,
> simulate a rule before adopting it, and retract it cleanly.

> 🎯 **Use case.** "Every employee based in France speaks French." As soon as you add "Alice is an
> employee" and "Alice is based in France", the fact "Alice speaks French" is **derived automatically**,
> with its provenance; remove a premise and the derived fact cleanly disappears. The problem it solves:
> encode a policy **once** instead of re-entering the consequence for every case.

## Write a rule and derive

```ts
import { RuleEngine, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid());
await kb.tell('alice', 'parent_of', 'charlie');
await kb.tell('charlie', 'parent_of', 'diana');

const engine = new RuleEngine(kb);
engine.addRuleFromText('X parent_of Y ; Y parent_of Z => X grandparent_of Z', 'grandparent');

await engine.applyAllRules();
kb.ask('alice', 'grandparent_of');                 // → ['diana']
engine.whyDerived('alice', 'grandparent_of', 'diana');
//    → { ruleName: 'grandparent', binding: 'X=alice, Y=charlie, Z=diana' }
```

- **`addRuleFromText(dsl, name, origin?)` → `Rule | null`** — adds a "conditions `=>` conclusions" rule
  (normalized + validated). `null` if refused (reason in `lastRefineError`).
- **`applyAllRules()` → `Promise<number>`** — forward chaining: applies all rules to stability, returns
  the number of facts added.
- **`whyDerived(s, p, o)` → `DerivedFact | undefined`** — the **provenance** of a derived fact (rule +
  variables); `undefined` if it is direct.
- **`dryRun(rule)` → `{ solutions, conclusions, truncated }`** — **simulates** what a rule would produce,
  writing nothing — to decide before adopting.

## Dictate a rule in natural language

```ts
import { NaturalRuleParser, RuleFactory } from '@damba/libxn';

const parsed = NaturalRuleParser.parse('If a person is an adult then they can vote');
//    → { dsl: 'X is adult => X can vote', … }
if (parsed) {
  engine.addRuleFromText(parsed.dsl, 'natural-input');
}
```

- **`NaturalRuleParser.parse(text)` → `ParsedRuleNL | null`** — converts "if … then …" / "every …"
  (FR + EN) into DSL. **Conservative**: `null` if it isn't clearly a rule (a plain fact isn't
  transformed).
- **`RuleFactory.refine(dsl)` → `{ ok, rule | reason, warnings }`** — quality control: normalizes and
  **rejects with a reason** (unbound variable, tautology, duplicate condition…).

## Discover rules from data

`RuleInducer` proposes plausible rules by observing **regularities** — each proposal is **tested**
(support, confidence, counterexamples). A human validates before adoption.

```ts
import { RuleInducer } from '@damba/libxn';

for (const who of ['alice', 'bob', 'charlie']) {
  await kb.tell(who, 'lives_in', 'france');
  await kb.tell(who, 'speaks', 'french');
}

const report = new RuleInducer(kb).induce({ minConfidence: 0.8 });
report.proposals[0];
//    → { dsl: 'X lives_in france => X speaks french', support: 3, confidence: 1, counterexamples: [] }
```

- **`induce(opts?)` → `InductionReport`** — mines implications and compositions, tests them against the
  KB, returns **proposals sorted by confidence** with their **counterexamples** (proof of imperfection).
  Options: `minSupport`, `minConfidence`, `maxRules`.

## Exceptions, because a real domain is made of them

A general rule followed by its exceptions is the very shape of a code, a standard or an internal
procedure. Without exceptions, a base produces rules that are true one by one and false together.

So a rule carries an **`unless`** clause and a **priority**. When two rules conclude different
things about the same subject, the more **specific** one wins, that is, the one whose conditions
are a strict superset of the other's.

```ts
engine.addRuleFromText(
  'X employee true => X access true unless X suspended true',
  'employee-access',
);
```

In plain language, "unless", "except if", and their French equivalents are recognised.

### A conclusion can be withdrawn later

This is the property most engines lack: a derived fact whose exception becomes true **is
withdrawn**, with nothing to replay by hand. Adding "Alice is suspended" afterwards removes the
access that had been derived.

### A conflict is stated, not lost

A derivation set aside by an exception or by a more specific rule is **logged**, never silently
dropped. You can therefore ask why an expected conclusion is missing.

```ts
engine.listConflicts();                        // what was blocked, and by what
engine.whyBlocked('alice', 'access', 'true');  // the winning rule, or the exception in play
```

> ⚠️ **Known limit.** An exception that depends on its own chain ("a implies b, unless c; b implies
> c") settles without looping, but leaves the intermediate conclusion in place: revision judges
> **defeat**, not **support**. Full removal goes through retraction, which re-derives.

## Use cases

| Situation | Tool |
|---|---|
| Auto-derive (grandparents, access rights, categories) | `RuleEngine` + `applyAllRules` |
| Let a user write a rule in plain language | `NaturalRuleParser` → `RuleEngine` |
| Check a rule before enabling it | `dryRun` (simulation) |
| Surface hidden rules from data | `RuleInducer.induce` → human validation |
| Explain a conclusion ("why?") | `whyDerived` (provenance) |

> 🔒 **Guardrails.** A rule only applies if it **parses exactly** like facts (`RuleFactory`), an induced
> rule is never adopted without **human validation**, and every derived fact stays **retractable**
> (truth maintenance).
