# Les paquets — quoi, et quand l'utiliser

QPath est un **cœur** minimal (`@damba/libxn`) entouré de paquets **optionnels**, chacun branché par des
**ports** (interfaces) plutôt que par des dépendances en dur. Vous n'installez que ce dont vous avez
besoin : tout le reste reste découplé, et le cœur fonctionne seul, sans réseau ni navigateur.

> 💡 **Règle simple.** Commencez par `@damba/libxn`. Ajoutez un paquet quand vous avez un besoin précis
> (piloter un LLM, persister, encoder une image, afficher en 3D…). Les paquets « adaptateur » (Postgres,
> Qdrant, Redis) implémentent un port du cœur : on les remplace sans toucher au reste.

## Cœur

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn`** | Mémoire symbolique QPath : faits `(sujet, prédicat, objet)`, raisonnement déterministe (héritage, multi-saut, contradictions), temporel, règles, flux. Headless. | **Toujours.** C'est la fondation. | universel |

## LLM, agents & outils

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-tools-llm`** | [Catalogue de 230 tools](/tool-catalog) provider-agnostique exposant toute la surface de QPath. | Laisser **n'importe quel LLM** piloter QPath en function-calling. | universel |
| **`@damba/libxn-agents`** | [RAG + agents](/agents) : Retriever multi-sources, orchestrateur LLM, DSL QPath, agents (curateur, chercheur, tuteur). | Construire un **chat/agent** ancré sur QPath avec récupération. | universel |
| **`@damba/libxn-intent`** | [Routeur d'intention](/intent-routing) sémantique (structure + trigrammes), 0 token par défaut. | Décider **ce que veut** un message avant de le traiter. | universel |

## Apprentissage & déduction

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-generative`** | [Déduction générative ancrée](/generative-deduction) : analogie, héritage, synthèse, avec **quarantaine** (rien n'est écrit sans validation). | Générer/déduire de **nouveaux faits** plausibles, sous contrôle. | universel |
| **`@damba/libxn-qpath-ml`** | [Mémoire d'entités](/entity-memory) (similarité VSA) + [réseaux entraînables](/qpath-ml) (MLP/Directional/GridNet) + [routage de faits](/fact-routing). | « Qui ressemble à X ? », deviner un trait, apprendre sur la **représentation directionnelle**. | universel |

## Entrées & encodage

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-encoders`** | [Encodeurs perceptuels](/encoders) : image multi-résolution, audio/spectrogramme → bits QPath. | Mémoriser de l'**image/audio** dans le même graphe que le texte. | navigateur |
| **`@damba/libxn-embeddings`** | [Embeddings sémantiques](/semantic-search) locaux (MiniLM via Web Worker), 384 dimensions. | **Recherche sémantique** par le sens, sans appel réseau. | navigateur |

## Sortie & interface

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-visualization`** | [Rendu 3D](/visualization) Three.js du graphe (implémente le port `GridView`). | **Explorer/déboguer** la mémoire, surligner un chemin de raisonnement. | navigateur |
| **`@damba/libxn-react-ui`** | [UI pilotée par faits](/fact-driven-ui) : l'écran et le comportement décrits en faits QPath, rendus par React. | Construire une UI **dont l'état vit dans la mémoire**. | navigateur |

## Persistance & infrastructure

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-postgres`** | [Adaptateurs Postgres/pgvector](/persistence) des ports KbStore, FactStore (ACID), VectorStore, MediaStore. | **Persister** durablement côté serveur (Neon/Postgres). | serveur |
| **`@damba/libxn-qdrant`** | Adaptateur Qdrant du port `VectorStore`. | Stocker les **vecteurs** dans Qdrant pour la recherche sémantique. | serveur |
| **`@damba/libxn-cache`** | Port `Cache` (get/set/getOrCompute) + adaptateurs (mémoire, Redis) ; [décore](/caching) embeddings/recherche/LLM/snapshots. | **Mettre en cache** les opérations coûteuses (fail-open). | universel |
| **`@damba/libxn-cache-redis`** | Adaptateur **ioredis** du port `RedisLike` de `libxn-cache`. | Cache **distribué** (multi-process) via Redis. | serveur |

## Maturité

L'ensemble est en **pré-1.0** (v0.1.x) et n'est pas encore publié sur npm : on consomme les paquets en
local (monorepo). Niveaux de maturité indicatifs :

- **Solide** : `@damba/libxn` (cœur) — la surface de lecture/raisonnement est caractérisée par des
  centaines de tests, recall mesuré 100 % jusqu'à 400 000 faits.
- **Stable, API jeune** : `libxn-postgres`, `libxn-cache`, `libxn-intent`, `libxn-generative`,
  `libxn-qpath-ml`, `libxn-tools-llm` — testés, mais l'API peut bouger avant la 1.0.
- **Navigateur / périphérie** : `libxn-encoders`, `libxn-embeddings`, `libxn-visualization`,
  `libxn-react-ui` — fonctionnels, dépendants de l'environnement (Canvas/WebGL/Worker/React).

> En pratique : bâtissez sur le **cœur** sans réserve ; pour les paquets périphériques, épinglez la version
> et prévoyez de petites adaptations d'API d'ici la 1.0.

## Choisir en une phrase

- **Juste de la mémoire et du raisonnement** : `@damba/libxn` seul.
- **Un assistant piloté par LLM** : + `libxn-tools-llm` (ou `libxn-agents` pour le RAG complet).
- **Multimodal** (image/audio/sens) : + `libxn-encoders` et/ou `libxn-embeddings`.
- **En production** : + `libxn-postgres` (persistance) et `libxn-cache` (+ `-redis` si multi-process).
- **Pour voir/déboguer** : + `libxn-visualization`.
