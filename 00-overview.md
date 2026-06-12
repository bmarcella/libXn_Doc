# Aperçu

QPath est une **mémoire symbolique adressable par contenu** : une seule structure de graphe qui stocke,
indexe, récupère et raisonne — sans modèle de langage pour le cœur, de façon **déterministe et à 0 token**.

::: info LibXN & QPath
**QPath** est le primitif : la structure de graphe et son raisonnement. **LibXN** est la librairie qui
l'implémente et l'entoure d'un écosystème (visualisation, persistance vectorielle, ponts LLM). En bref :
QPath = le cœur ; LibXN = le cœur + ses outils. Le paquet `@damba/libxn` est ce noyau, autonome.
:::

👉 Concrètement : voir les **[cas d'usage](use-cases)** (mémoire d'agent IA, graphe de connaissances,
recommandation, raisonnement explicable, offline/souverain…) avec exemples de code.

## Ce que ça fait

- **Mémoire de faits** — stocke des relations (sujet, prédicat, objet) ; interrogation directe ou
  inverse, intersections/unions, comparaisons, similarité.
- **Raisonnement** — chaînage avant et arrière tracé (héritage, transitivité, compositions déclarées),
  + des modes combinant QPath et un LLM : [Flash reasoning](flash-reasoning) et
  [PingPong reasoning](pingpong-reasoning).
- **Apprentissage léger** — régression et classification à partir d'exemples, sans entraînement coûteux.
- **Multi-modal** — texte, nombres et données tabulaires convergent vers la même structure.

## Pourquoi c'est différent

- **Déterministe** — mêmes entrées → mêmes résultats, toujours. Pas d'hallucination.
- **Auditable & éditable** — la mémoire est un graphe qu'on peut lire, corriger, versionner.
- **0 token, temps réel** — les requêtes sont quasi instantanées et ne coûtent aucun appel modèle.
- **Souverain** — tout peut tourner en local ; aucune donnée ne sort.

## Preuve (benchmark intégré)

Sur les scénarios de référence : **recall 100 % (34/34) · ~0,07 ms par requête**. Récupération exacte,
cascades de règles, jointures multi-variables, comparaisons numériques (>, <, entre), agrégats
(count/sum/avg/min/max), quantificateurs (tous/existe) et **héritage avec exceptions** (« le pingouin
est un oiseau mais ne vole pas » — le « non » est prouvé, pas deviné) — déterministe, à 0 token.
La mémoire détecte aussi les **contradictions à l'écriture** et sait **induire ses propres règles**
depuis ses régularités (support, confiance, contre-exemples), sous validation humaine.

## Intégrations

Le cœur est **isomorphe et sans dépendance** (Node, navigateur, Web Worker). Les briques optionnelles
(visualisation 3D, recherche vectorielle type Qdrant, embeddings) se branchent via des adaptateurs —
voir [Architecture](04-guides/architecture).

---

::: tip Note
Le fonctionnement interne de QPath (encodage, spécification formelle) n'est pas publié ici.
Pour un accès technique ou un partenariat, contactez l'auteur.
:::
