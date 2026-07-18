# Connaissance discrète (faits) vs continue (documents)

QPath est une mémoire de **connaissance discrète** : des **faits atomiques**, chacun exprimable en un
triplet **sujet → prédicat → objet**, récupérés et raisonnés de façon **déterministe, à 0 token**.
Savoir distinguer le discret du continu, c'est savoir **quand QPath est le bon outil**.

> 🎯 **Cas d'usage.** « Le taux de TVA est de 20 % », « Alice travaille chez Acme », « la prescription est
> de 6 ans » : ces affirmations précises appellent une **réponse exacte, toujours la même**. À l'inverse,
> « résume-moi l'ambiance du roman » relève du continu, où un LLM excelle. Le problème résolu : savoir
> **quand** poser une connaissance dans QPath (le discret, vérifiable) plutôt que de tout confier à un
> modèle qui approxime.

## Qu'est-ce qu'un fait discret ?

Une affirmation **précise et autonome**, qui tient toute seule :

- Paris **est la capitale de** la France
- La prescription pénale **est de** 6 ans
- Le taux de TVA **est** 20 %
- Un chien **est un** mammifère
- Alice **travaille chez** Acme

Chacune se range en `(sujet, prédicat, objet)` et se retrouve **exactement**, sans ambiguïté.

## Pourquoi c'est le cœur de QPath

Pour la connaissance discrète, QPath offre ce qu'un modèle probabiliste ne peut pas garantir :

- **Déterministe** — la même question donne toujours la même réponse, sans hallucination.
- **0 token** — la récupération et le raisonnement (héritage, transitivité, agrégats) ne coûtent rien.
- **Auditable & éditable** — chaque fait a une source ; on ajoute, corrige ou retire un fait à l'unité.

Idéal pour : **règles, définitions, données structurées, politiques, ontologies, références**.

## L'autre nature : la connaissance continue

Un **livre**, un article, un rapport : de la **prose longue** où le sens est étalé, contextuel,
nuancé. La réduire à des triplets propres ferait perdre le sens. Cette connaissance se traite par une
couche **sémantique** (embeddings) **complémentaire** : on retrouve le **passage pertinent par le
sens**, pas par un fait exact.

## Comment choisir

| Question | Alors |
|---|---|
| Je peux l'écrire en **une phrase factuelle** précise ? | **Fait discret** → QPath |
| C'est de la **prose longue** dont le sens dépend du contexte ? | **Document** → recherche sémantique |

## Une image

- **Discret** = des **fiches** dans un classeur : chaque fiche est un fait exact, retrouvé à coup sûr.
- **Continu** = un **livre** sur une étagère : on cherche le bon passage par le sens.

## Les deux se complètent

QPath (faits discrets) **ancre** la vérité — exacte, traçable, à 0 token ; la couche sémantique
**élargit** la recherche aux longs textes. En pratique, on raisonne sur les faits et on s'appuie sur
les documents pour le contexte : c'est l'approche **hybride**.
