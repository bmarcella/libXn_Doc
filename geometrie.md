# La géométrie du savoir

La plupart des systèmes d'IA rangent la connaissance dans des **nombres flous** : des poids répartis dans
d'immenses matrices, appris par entraînement, impossibles à lire un par un. QPath fait le choix inverse :
le savoir a une **place**. Chaque élément occupe une position déterminée dans un espace qui **grandit à la
demande**. C'est ce qu'on appelle ici la géométrie du savoir, et c'est la source de la plupart des
propriétés de QPath.

## Une place, pas un poids

Dans un modèle statistique, « chien » n'existe nulle part en particulier : il est dilué dans des millions
de coefficients. Dans QPath, un terme, un fait, une relation ont chacun une **position identifiable**.
On peut la pointer, la lire, l'expliquer. Rien n'est dilué, donc rien n'est flou.

Deux conséquences immédiates :

- **Déterminisme.** La même entrée arrive toujours à la même place. Il n'y a pas de tirage, pas de
  température, pas d'aléa : deux fois la même question, deux fois la même réponse.
- **Auditabilité.** Puisque chaque chose a une adresse, on peut toujours répondre à « d'où vient cette
  réponse ? » en montrant le chemin parcouru, pas une probabilité opaque.

## Un espace qui grandit

Un réseau classique a une taille **fixée d'avance** : un nombre de paramètres décidé au design, rempli par
l'entraînement. L'espace de QPath n'a pas de taille figée. Il **s'étend au fur et à mesure** que de
nouvelles connaissances arrivent, exactement là où il le faut, sans toucher au reste.

- **Pas d'entraînement préalable.** On ajoute un fait, il prend sa place. Rien à ré-optimiser.
- **Pas d'oubli catastrophique.** Ajouter du neuf ne déforme pas l'ancien : les places existantes ne
  bougent pas. C'est l'inverse d'un modèle qu'il faut ré-entraîner en risquant d'écraser ce qu'il savait.

## Adresser par le contenu

Parce que la position d'un élément découle de **son contenu**, deux systèmes qui n'ont jamais communiqué
placent la même connaissance au même endroit. C'est le principe de l'**adressage par contenu** : l'identité
d'une chose EST sa place. Le paquet [lexkey](/lexkey) pousse cette idée jusqu'au bout pour les mots — une
adresse stable, identique partout, qui permet de **fusionner deux mémoires sans coordination**.

L'adressage par contenu explique aussi pourquoi les récupérations sont **instantanées et gratuites** : on
ne cherche pas, on va directement à la place. Aucun token, aucun appel de modèle.

## Raisonner, c'est composer des chemins

Si les faits sont des places, les relations sont des **chemins** entre elles. Raisonner ne consiste alors
pas à multiplier des matrices, mais à **suivre et composer des chemins** : « Paris est en France, la France
est en Europe, donc Paris est en Europe » se lit comme un trajet, étape par étape. C'est pour cela que
chaque conclusion arrive avec sa trace : le chemin EST l'explication.

> **Ce que la géométrie apporte, en une phrase.** Donner une place à chaque chose rend la mémoire
> déterministe, auditable, extensible sans entraînement et fusionnable par le contenu. Le raisonnement
> devient un déplacement traçable, pas une prédiction opaque.

## Pour aller plus loin

- [Pourquoi QPath](/why-qpath) — ce que cette approche corrige face à un LLM seul.
- [Connaissance discrète](/discrete-knowledge) — quand cette géométrie est le bon outil.
- [Mémoire compacte (lexkey)](/lexkey) — l'adressage par contenu appliqué à l'identité des mots.
- [Visualisation 3D](/visualization) — voir l'espace du savoir se déployer.
