# Compréhension — donner du sens

QPath ne fait pas que **raisonner** (dériver une conclusion d'un fait) ; il **comprend** : il **donne du
sens** à une information ambiguë en la **reliant aux connaissances déjà dans la grid**. Plus QPath sait,
mieux il comprend. Tout est **déterministe, à 0 token, traçable** — aucun LLM.

> Comprendre = donner du sens · relier au déjà-connu · interpréter le contexte · construire une
> représentation de ce qui est décrit.

## 1. Coréférence informée par la grid

> « Jean a laissé tomber son verre. **Il** est cassé. »

À qui renvoie « Il » ? Une coréférence naïve dirait « le dernier sujet » → *Jean* (faux). QPath choisit
le bon antécédent en reliant le **prédicat** aux **propriétés connues** de chaque candidat :

- la grid sait qu'un **verre** *est un objet fragile* qui *peut casser* → plausible ;
- une **personne** ne « casse » pas → improbable.

⇒ **« Il » = le verre.**

## 2. Interprétation causale et temporelle

QPath construit la **représentation de la scène** : à partir d'un schéma de bon sens
`tomber → peut causer → casser`, il relie les événements —

> le verre s'est cassé **après** et **à cause de** sa chute.

Cette représentation est ensuite **raisonnable** : on peut remonter la cause racine, dérouler les
conséquences, ordonner la chronologie.

## 3. Déduction par similitude (« Big Bang »)

QPath cherche les **similitudes** dans toute la grid, les **compile**, et **déduit de nouveaux faits
solides** —

> Socrate et Platon sont des hommes mortels. Aristote est un homme ⇒ **Aristote est probablement
> mortel.**

La déduction émerge des **sujets qui se ressemblent** et des **régularités de classe**. Chaque fait
déduit porte sa **confiance** (sa corroboration : plus de cas l'attestent, plus c'est solide) et sa
**provenance** (par quoi/qui il est soutenu) — rien n'est asséné en aveugle.

## Pourquoi c'est différent

- **Relié au déjà-connu** — la compréhension s'appuie sur un petit socle de bon sens **et** sur la
  mémoire de l'utilisateur ; elle **s'améliore quand la mémoire grandit**.
- **Déterministe & traçable** — pas de boîte noire : chaque interprétation/déduction est explicable.
- **0 token** — aucun appel à un modèle de langage.

La compréhension porte la **raisonnement** au-delà des faits explicites : interpréter, représenter,
puis déduire — comme on comprend une phrase, pas seulement comme on récupère une donnée.
