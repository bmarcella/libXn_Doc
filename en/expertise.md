# Expertise — knowledge that is named, examined and carried

A **skill** says how to work. An **expertise** says what is known about a domain. It is a named
object, built from documents, that can be queried, put through an exam, shared, installed on
someone else's account and cleanly removed.

> 💡 **The principle.** *Writing to memory is learning.* There is no training step between the
> moment a document comes in and the moment Damba answers about it. The knowledge is made of
> ordinary facts and rules, with their provenance, and it is removed the same way it was placed.

> 🎯 **Use case.** A firm drops in its internal policy and two industry standards. Damba draws
> definitions, obligations, durations and rules out of them, each one attached to the unit of text
> it came from. A question finds its answer and the article that carries it. A colleague receives
> the same expertise with one command, and it behaves on their account exactly as it does on yours.

## What an expertise is

A named object gathering four things:

| Content | What it is |
| --- | --- |
| **Facts** | what the documents state, each cited to its source unit |
| **Rules** | the domain's "if … then …", exceptions included |
| **Documents** | the source units themselves, with their version |
| **Vocabulary** | the domain's terms and their equivalents, drawn from the definitions |

An expertise is not a separate format: these are facts and rules of the memory, grouped under a
name. That grouping is what makes installation, examination and wholesale removal possible.

## From documents to an expertise

A normative text is not read as a block. It is first split into **units**: an article, a
paragraph, a section of a standard. Every retained fact keeps its unit's name, which gives you the
citation for free at answer time.

```ts
import { buildExpertise, installExpertise } from '@damba/libxn';

const expertise = buildExpertise({
  slug: 'internal-policy',
  documents: [{ name: 'policy-2026', text: documentContent }],
});

await installExpertise(kb, expertise);
```

In the product this is one sentence in the chat: "learn this document as the internal policy
expertise". The button next to a loaded document does the same thing.

## The exam: measure, do not declare

Saying that a system "has become an expert" means nothing until someone has questioned it. Damba
**generates** an exam from what it has just learned, answers it without calling any AI, and returns
a report.

```ts
import { generateRecallQuestions, runExam } from '@damba/libxn';

const questions = generateRecallQuestions(expertise);
const report = await runExam(kb, questions);
// report.recall.ratio       → what is found again
// report.recall.citedRatio  → what is cited to the right source
```

Two numbers, not one: **finding** a piece of information and **knowing where it comes from** are
two different abilities, and a system can hold the first while missing the second.

> ⚠️ **What the exam measures, and what it does not.** It measures recall, rule application and
> citation. It does not measure argument or interpretation. "Answers right, cites right, without
> spending tokens, on cases shaped like the corpus" is a checkable promise; "high-level expert" is
> not.

## The case has to reach the rules

A domain has its vocabulary, and nobody speaks that vocabulary when asking a question. A rule
written in the words of a code will never fire if the case is described in everyday words.

So the expertise builds its own **vocabulary** from the corpus definitions, and uses it at write
time: an incoming statement is brought closer to the domain's terms before being recorded. The
subject is never touched, a weak match is ignored, and every change is logged.

That is the difference between a base that contains the right rule and a base where the rule fires.

## Share, install, remove

An expertise is shared by **copy**, never by live link: sharing grants the right to install,
installing makes a copy. A live link would change the recipient's behaviour behind their back the
day the author edits their own base.

```ts
import { exportExpertise, importExpertise, uninstallExpertise } from '@damba/libxn';

const json = exportExpertise(expertise);      // portable
const received = importExpertise(json);        // validated on the way in
uninstallExpertise(kb, 'internal-policy');     // wholesale removal
```

Removal is clean because the grouping is: the facts and rules the expertise placed leave together,
and nothing else moves.

## What acquisition still owes to AI

This has to be said plainly, because it was measured and published.

Reading a normative text **without AI** recognises what repeats in it: definitions, penalties,
durations, obligations. Measured on whole public corpora (a criminal code in two languages, two
technical standards), that reading covers roughly **one tenth** of the sentences. The rest is prose
that has to be understood, not merely recognised.

In other words:

- **immediate in use: real.** Once written, the information is read back in full, cited, applied
  through rules, and the answer costs no tokens.
- **immediate in acquisition: not yet.** Extracting from a document depends on an AI for about nine
  sentences out of ten, with the quarantine and validation that surround it.

What the study produced and what remains: citation by source unit, the generated exam, the domain
vocabulary, and the expertise object itself. Those are the tools that make extraction
**auditable**, not a replacement for extraction.

## Nearby

- [Rules & induction](/en/rules) — rules, their exceptions and their provenance
- [Skills](/en/skills) — know-how, to be distinguished from domain knowledge
- [Fact provenance](/en/fact-provenance) — "why do I know this?"
- [Right to forget](/en/right-to-forget) — removing without breaking what depends on it
