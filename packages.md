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
| **`@damba/libxn-tools-llm`** | [Catalogue de tools](/tool-catalog) provider-agnostique (≈245) exposant toute la surface de QPath. | Laisser **n'importe quel LLM** piloter QPath en function-calling. | universel |
| **`@damba/libxn-agents`** | [RAG + agents](/agents) : Retriever multi-sources, orchestrateur LLM, DSL QPath, agents (curateur, chercheur, tuteur). | Construire un **chat/agent** ancré sur QPath avec récupération. | universel |
| **`@damba/libxn-intent`** | [Routeur d'intention](/intent-routing) sémantique (structure + trigrammes), 0 token par défaut. | Décider **ce que veut** un message avant de le traiter. | universel |
| **`@damba/libxn-web-search-scraping`** | Recherche web par **scraping multi-moteurs sans clé** (DuckDuckGo/Wikipédia/Google/SearXNG) + crawl best-first des sous-liens. | Donner à l'agent un **accès web** sans clé d'API. | serveur |
| **`@damba/libxn-llm-providers`** | Registre **externe** des endpoints LLM (`providers.json`) ; les paquets restent sans URL ni clé (branchés par ports). | Choisir **quel fournisseur LLM** par section, hors du code. | universel |

## Apprentissage & déduction

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-generative`** | [Déduction générative ancrée](/generative-deduction) : analogie, héritage, synthèse, avec **quarantaine** (rien n'est écrit sans validation). | Générer/déduire de **nouveaux faits** plausibles, sous contrôle. | universel |
| **`@damba/libxn-qpath-ml`** | [Mémoire d'entités](/entity-memory) (similarité VSA) + [réseaux entraînables](/qpath-ml) (MLP/Directional/GridNet) + [routage de faits](/fact-routing). | « Qui ressemble à X ? », deviner un trait, apprendre sur la **représentation directionnelle**. | universel |
| **`@damba/libxn-nap-grid`** | [Mémoire qui apprend](/nap-grid) : le graphe QPath qui grandit **est** le réseau (régression/classification auditables depuis un dataset ou les faits de la KB). | Prédire une valeur/classe **auditable**, apprise sur la structure elle-même. | universel |

## Entrées & encodage

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-encoders`** | [Encodeurs perceptuels](/encoders) : image multi-résolution, audio/spectrogramme → bits QPath. | Mémoriser de l'**image/audio** dans le même graphe que le texte. | navigateur |
| **`@damba/libxn-embeddings`** | [Embeddings sémantiques](/semantic-search) locaux (multilingual-e5-small via Web Worker), 384 dimensions. | **Recherche sémantique** par le sens, sans appel réseau. | navigateur |

## Sortie & interface

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-visualization`** | [Rendu 3D](/visualization) Three.js du graphe (implémente le port `GridView`). | **Explorer/déboguer** la mémoire, surligner un chemin de raisonnement. | navigateur |
| **`@damba/libxn-ui-core`** | [UI pilotée par faits](/fact-driven-ui) — **cœur agnostique** : vocabulaire, `renderTree`, sucre, store, tools, authoring. Sans React ni Angular. | Base partagée des bindings UI (rarement utilisé seul). | universel |
| **`@damba/libxn-react-ui`** | [UI pilotée par faits](/fact-driven-ui) : binding **React** du cœur ci-dessus. | Construire une UI **dont l'état vit dans la mémoire**, en React. | navigateur |
| **`@damba/libxn-angular-ui`** | [UI pilotée par faits](/fact-driven-ui) : binding **Angular** (`<fact-ui>`, réconciliation par identité de nœud). | Même chose, en Angular. | navigateur |
| **`@damba/libxn-form`** | Formulaires **typés pilotés par faits** : builder + remplissage → faits compagnons en cascade (relations 1-N / N-N). | Collecter des données **structurées** (vs saisie chat bruitée). | universel |

## Persistance & infrastructure

| Paquet | Ce que ça fait | Quand l'utiliser | Env |
|---|---|---|---|
| **`@damba/libxn-postgres`** | [Adaptateurs Postgres/pgvector](/persistence) des ports KbStore, FactStore (ACID), VectorStore, MediaStore. | **Persister** durablement côté serveur (Neon/Postgres). | serveur |
| **`@damba/libxn-qdrant`** | Adaptateur Qdrant du port `VectorStore`. | Stocker les **vecteurs** dans Qdrant pour la recherche sémantique. | serveur |
| **`@damba/libxn-cache`** | Port `Cache` (get/set/getOrCompute) + adaptateurs (mémoire, Redis) ; [décore](/caching) embeddings/recherche/LLM/snapshots. | **Mettre en cache** les opérations coûteuses (fail-open). | universel |
| **`@damba/libxn-cache-redis`** | Adaptateur **ioredis** du port `RedisLike` de `libxn-cache`. | Cache **distribué** (multi-process) via Redis. | serveur |
| **`@damba/libxn-lexkey`** | [Mémoire compacte](/lexkey) : identité de mot **adressée par contenu** (128 bits) + interning (stocker des identifiants, pas des mots répétés) + codec de snapshot (dédup termes & provenance). | **Compacter** la mémoire persistée et la rendre **fusionnable** par adresse. | universel |

## Maturité

L'ensemble est en **pré-1.0** (v0.1.x) et n'est pas encore publié sur npm : on consomme les paquets en
local (monorepo). Niveaux de maturité indicatifs :

- **Solide** : `@damba/libxn` (cœur) — la surface de lecture/raisonnement est caractérisée par des
  centaines de tests, recall mesuré 100 % jusqu'à 400 000 faits.
- **Stable, API jeune** : `libxn-postgres`, `libxn-cache`, `libxn-intent`, `libxn-generative`,
  `libxn-qpath-ml`, `libxn-nap-grid`, `libxn-tools-llm`, `libxn-lexkey`, `libxn-web-search-scraping`,
  `libxn-llm-providers`, `libxn-form` — testés, mais l'API peut bouger avant la 1.0.
- **Navigateur / périphérie** : `libxn-encoders`, `libxn-embeddings`, `libxn-visualization`,
  `libxn-react-ui`, `libxn-angular-ui` (+ cœur `libxn-ui-core`) — fonctionnels, dépendants de
  l'environnement (Canvas/WebGL/Worker/React/Angular).

> En pratique : bâtissez sur le **cœur** sans réserve ; pour les paquets périphériques, épinglez la version
> et prévoyez de petites adaptations d'API d'ici la 1.0.

## Choisir en une phrase

- **Juste de la mémoire et du raisonnement** : `@damba/libxn` seul.
- **Un assistant piloté par LLM** : + `libxn-tools-llm` (ou `libxn-agents` pour le RAG complet).
- **Multimodal** (image/audio/sens) : + `libxn-encoders` et/ou `libxn-embeddings`.
- **En production** : + `libxn-postgres` (persistance) et `libxn-cache` (+ `-redis` si multi-process).
- **Pour voir/déboguer** : + `libxn-visualization`.
