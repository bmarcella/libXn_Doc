# Architecture — noyau vs périphérie

## Principe

QPath est traité comme un **primitif réutilisable**. Le paquet `@damba/libxn` ne contient que ce qui
est **framework-agnostic et sans dépendance lourde** : zéro Angular, zéro Three.js, zéro accès réseau,
zéro service applicatif. **Zéro dépendance runtime** (`dependencies: {}` ; les événements passent par un `Emitter` interne).

## Ce qui est dans le noyau

```
@damba/libxn
├── core      BinaryConverter · XNeurone · XNeuroneGrid · PathVectorizer
├── encoders  SemanticEncoder · TabularEncoder
├── symbolic  KnowledgeBase · PredicateAlgebra · ChainResolver · RuleEngine · NaturalParser
├── vector    VectorStore (port) · TextEmbedder (port) · VectorGridStore (logique hybride)
└── datasets  BenchScenarios · HousingDataset · IrisDataset
```

## Ce qui reste en périphérie (dans l'app, à extraire en sous-paquets)

| Lot | Modules | Pourquoi hors noyau |
|---|---|---|
| Visualisation **✅ extrait** | `XNeuroneVisualizerForGrid` → paquet `@damba/libxn-visualization` | Three.js + DOM |
| Embeddings | `SemanticVectorizer`, `embedding.worker` | `@huggingface/transformers`, Web Worker |
| Encodeurs perceptuels | `PerceptualEncoder`, `AudioEncoder` | canvas DOM |
| Base vectorielle **✅ extrait** | adaptateur Qdrant → paquet `@damba/libxn-qdrant` ; **pgvector** côté backend Damba (le port `VectorStore` + `VectorGridStore` + `InMemoryVectorStore` sont, eux, **dans le noyau**) | client REST / SQL |
| Persistance **✅ ports dans le noyau** | `KbStore` / `FactStore` / `SchemaMigrator` (+ `DurableKnowledgeBase`, `InMemory*`, `CachingKbStore`) ; adaptateurs Postgres côté backend | Postgres / pgvector — voir [Persistance](/persistence) |
| Récupération | `Retriever`, `WebSearcher` | services externes |
| Agents & LLM | `Agent`, `*Agent`, `LLMOrchestrator`, `LLMExtractor`, `QPathDSL` | API LLM |
| Entrées | `PdfReader`, `SpeechListener` | pdfjs / Web Speech API |

Chaque lot migrera en sous-paquet (`@damba/libxn/visualization`, `/embeddings`, `/persistence`…) avec
la même méthode : interface dans le noyau, implémentation injectée par l'hôte.

## Le patron d'inversion de dépendance (exemple : le rendu)

Le noyau ne doit jamais importer une couche lourde. Quand il a besoin d'un service de la périphérie, il
**définit une interface** et **reçoit l'implémentation par injection**. Exemple appliqué au visualiseur
Three.js :

1. Le noyau déclare `interface GridView` et `static XNeuroneGrid.viewFactory?`.
2. Le grid headless-by-default n'appelle que `GridView` ; il crée sa vue via la fabrique si elle existe.
3. L'hôte enregistre **une fois** la fabrique (le concret vient du sous-paquet `@damba/libxn-visualization`) :
   ```ts
   import { XNeuroneGrid } from '@damba/libxn';
   import { XNeuroneVisualizerForGrid } from '@damba/libxn-visualization';
   XNeuroneGrid.viewFactory = (door) => new XNeuroneVisualizerForGrid(door);
   ```

Résultat : `three` n'entre jamais dans le paquet, et l'app garde son rendu 3D inchangé.

## Compatibilité pendant l'extraction

Les anciens chemins `src/app/LibXN/<X>.ts` sont des **shims** qui ré-exportent depuis `@damba/libxn/<X>`.
Les importeurs existants (app + périphérie) n'ont donc pas changé, et le build reste vert à chaque
étape. Les shims seront retirés quand tous les importeurs pointeront directement vers `@damba/libxn`.

## Pourquoi cette frontière

- **Le noyau se teste sans navigateur** (vitest/Node) — preuve de réutilisabilité.
- **La périphérie reste optionnelle** — un consommateur ne paie que ce qu'il utilise.
- **La structure ci-dessus est publique ; le fonctionnement interne du noyau ne l'est pas** (accès technique sur demande).
