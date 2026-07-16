# The right to be forgotten, proven

Almost every assistant today can write convincing text. Very few can **forget cleanly** what you
entrusted to them, and prove it. This is a scenario Damba does end to end, and that most AI products
cannot guarantee.

## The scenario

A firm uses Damba as its company memory. Over six months, dozens of people fed it in plain language,
with no form to fill and no database to manage:

> "The client Acme is in France."
> "Our French clients are billed in euros."
> "Acme has a main contact, Marie."
> "Marie's email is marie@acme.fr."

Then Acme leaves. The user writes a single sentence:

> "Remove Acme."

## What happens, and why it is rare

### 1. The removal cascades over everything that depended on Acme

Every piece of information ingested about Acme was attached to that record the moment it came in.
Removing Acme therefore removes the whole record in one gesture: the contact, the email, and even the
facts that had been **derived** by a business rule ("billed in euros" came from the rule "French clients,
so euros"). Nothing lingers, there is no leftover to clean up by hand.

### 2. Nothing is truly erased, everything is archived in time

A removal does not destroy the data: it archives it with its date. So you can later ask:

> "What did I know about Acme on March 3rd?"

and Damba returns the exact state as of that date. This is a **compliant and reversible** forgetting:
the information leaves everyday use, but the history stays auditable. That is exactly what a serious
right to be forgotten requires, and what a model that merely generates text cannot offer: it does not
"unlearn" a fact, and it knows no date of truth.

### 3. The next answer cannot be made up

If someone asks for Marie's email again after the removal, Damba answers:

> "That information was removed on July 9th."

It reads its fact memory, it does not **fabricate** a plausible answer. A product that answers by
generating text may instead offer a believable but wrong email. Here, every answer carries its **source**
(who said it, when) and its status (active, removed, archived).

### 4. What was secret stayed secret from start to finish

If Marie's email had been marked **secret**, it would have been encrypted at rest, hidden from normal
reads, and **excluded from reasoning** even before the removal. The memory reasons over the record
without ever seeing the secret in the clear.

## The unique part

No single piece here is magic. What Damba does, and what stays rare, is their **combination, in a
deterministic way**:

- a memory that answers **instantly**, with its **provenance**;
- that **cannot hallucinate** what it knows or does not know;
- from which you remove a fact **and its entire logical descent** in a single gesture;
- while keeping the **dated history**;
- and the **encryption of secrets** throughout.

This is a property of how Damba **represents** knowledge, not an option bolted on top of a text
generator. The memory is inspectable, correctable and reversible by construction.

## Where it matters

- **Compliance and privacy**: answer a deletion request (GDPR, Quebec's Law 25) by showing *what* was
  removed, *when*, and *what followed from it*.
- **Regulated sectors** (health, finance, legal): every piece of served data carries its proof of origin.
- **Durable team memory**: accumulate months of knowledge without fearing you can no longer clean it up.

## Trying the idea

In Damba, everything runs in plain language: you inform, you ask, you correct, you remove, in simple
sentences. There is nothing to program to get this behavior.

To understand the mechanisms that make this scenario possible:

- [Companion facts](companion-facts): how a record groups its information for a cascading removal.
- [Fact hygiene](fact-maintenance): removal, archiving, freshness.
- [Provenance](fact-provenance): the source and date of every answer.
- [Access layer](access-layer): encrypted secrets and access control.

::: tip In one sentence
An assistant that forgets as well as it remembers, and can **prove** it.
:::
