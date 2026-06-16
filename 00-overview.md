# Aperçu

QPath est une **mémoire symbolique adressable par contenu** : une seule structure de graphe qui stocke,
indexe, récupère et raisonne — sans modèle de langage pour le cœur, de façon **déterministe et à 0 token**.

> **La thèse Damba.** Au-delà de la mémoire : **le comportement de l'application EST des faits**
> gouvernés — flots, règles, limites, anti-fraude vivent dans des faits qu'on interroge, gouverne et
> fait évoluer **à chaud, sans redéployer**, de façon déterministe et traçable. Voir le **[comportement
> dynamique](dynamic-behavior)** et la vitrine **[grand livre](transaction-ledger)** (`npm run example:ledger`).

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

Sur les scénarios de référence : **recall 100 % (37/37) · ~0,07 ms par requête**. Récupération exacte,
cascades de règles, jointures multi-variables, comparaisons numériques (>, <, entre), agrégats
(count/sum/avg/min/max), quantificateurs (tous/existe) et **héritage avec exceptions** (« le pingouin
est un oiseau mais ne vole pas » — le « non » est prouvé, pas deviné) — déterministe, à 0 token.
La mémoire détecte aussi les **contradictions à l'écriture**, sait **induire ses propres règles**
depuis ses régularités (support, confiance, contre-exemples) sous validation humaine, et raisonne
sur la **trame** des événements ([Plot Reasoning](plot-reasoning) : causes racines, conséquences,
chronologie, incohérences). Enfin, la [déduction proactive](insight-reasoning) anticipe et alerte
sans question : contradictions, presque-règles violées, données manquantes. Et l'identité est
de première classe : alias fusionnés, **homonymes séparés** (« deux Jean » ne se contredisent
pas — ils se distinguent), scission avec provenance préservée. QPath offre aussi une [couche d'accès](access-layer) pour les développeurs : faits secrets chiffrés, authentification par port injecté, gardes, et faits transactionnels (grand livre append-only).

## Intégrations

Le cœur est **isomorphe et sans dépendance** (Node, navigateur, Web Worker). Les briques optionnelles
(visualisation 3D, recherche vectorielle pgvector/Qdrant, embeddings) se branchent via des adaptateurs —
voir [Architecture](04-guides/architecture).

---

::: tip Note
Le fonctionnement interne de QPath (encodage, spécification formelle) n'est pas publié ici.
Pour un accès technique ou un partenariat, contactez l'auteur.
:::
