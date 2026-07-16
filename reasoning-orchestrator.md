# Raisonnement multi-étapes — la chaîne de pensée auditable

Une question simple se répond d'un seul geste : « où habite Marie ? » lit un fait. Une question
**composite** en demande plusieurs, enchaînés : « quelle est l'espérance de vie du chat de Marie ? »
suppose de reconnaître que ce chat est un chat, qu'un chat est un mammifère, et de lire enfin la
propriété sur les mammifères. Le **raisonnement multi-étapes** est l'étage qui coordonne ces gestes :
il fait se **relayer** plusieurs raisonneurs autour de la même mémoire de faits jusqu'à une conclusion.

> 💡 **Le principe.** La « chaîne de pensée » de Damba n'est pas une suite de mots produits au hasard.
> C'est une suite de **pas ancrés**, chacun étant un fait réel de la mémoire. Penser, ici, c'est
> **parcourir la mémoire**, pas générer du texte. La trace qui en résulte se relit, se vérifie et se
> rejoue.

## L'inverse d'une « chaîne de pensée » de modèle de langage

Un modèle de langage qui « raisonne étape par étape » produit des phrases intermédiaires qu'on ne peut
ni vérifier ni tracer : rien ne garantit qu'elles correspondent à un fait. La chaîne de Damba fait le
contraire. Chaque maillon est un fait **stocké**, avec sa provenance ; la conclusion ne tient que si la
chaîne complète tient. C'est un raisonnement **déterministe, à coût nul**, et surtout **auditable** :
on peut cliquer chaque pas et remonter au fait qui le justifie.

```
Question : « le chat de Marie est-il mortel ? »

  1. le chat de Marie est un chat        (fait connu)
  2. un chat est un mammifère            (fait connu)
  3. un mammifère est mortel             (fait connu)
  ⇒ le chat de Marie est mortel          conclusion, confiance 1.0
```

## Une mémoire de travail jetable

Entre deux pas, une déduction intermédiaire (« ce chat est un chat ») doit servir au pas suivant. Damba
l'écrit dans une **mémoire de travail** temporaire, posée par-dessus la mémoire réelle. Le raisonneur
suivant y lit comme s'il s'agissait d'un fait établi, puis cette mémoire de travail est **jetée** à la
fin. Rien de ce qui a servi à raisonner n'est écrit dans la mémoire durable sans validation : une
question ne modifie jamais ce que Damba sait.

## Le déterministe décide, l'appris propose

Plusieurs facultés peuvent contribuer. Certaines sont **déterministes** (lire un fait, suivre un
héritage, composer une chaîne). D'autres sont **apprises** (pressentir un rapprochement, proposer un
lien plausible). La règle est stricte et ne varie jamais :

> Une faculté apprise ne peut que **proposer un lien**. Ce lien n'est retenu que si une faculté
> **déterministe parvient à conclure à travers lui**. Aucune faculté apprise n'écrit jamais la réponse
> elle-même.

C'est la garantie anti-invention : l'intuition peut suggérer une piste, mais seule la déduction ancrée
décide. Une piste que rien ne confirme est simplement abandonnée.

## Toujours bornée, toujours une trace

Le raisonnement s'arrête dans tous les cas : soit il **conclut**, soit il déclare **indéductible**
(« je ne peux pas relier ces éléments », plutôt que d'inventer), soit il atteint sa **limite d'étapes**.
Il rend systématiquement une trace, même vide. C'est cette discipline qui rend Damba sûr sur un gros
corpus : il préfère dire « je ne sais pas » à fabriquer une réponse.

## Où on le voit

- Dans le **chat**, une réponse obtenue par raisonnement affiche sa chaîne pas-à-pas, chaque maillon
  étiqueté par la faculté qui l'a produit, avec un accès direct au fait correspondant.
- Le raisonnement multi-étapes s'invoque aussi explicitement pour résoudre « quelle est la valeur de
  telle propriété pour tel sujet ? » et rendre la conclusion **avec** sa justification.

## À rapprocher

- La [couche cognitive](/cognition) : comment les facultés se relaient autour de la colonne de faits.
- La [déduction générative](/generative-deduction) : produire du savoir neuf, ancré.
- La [Réalisation](/realization) : mettre le fait retenu en phrase vérifiable.
- La [mémoire qui apprend](/nap-grid) : une faculté apprise qui propose, sous contrôle.
