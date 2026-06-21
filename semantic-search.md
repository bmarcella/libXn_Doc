# Recherche sémantique & vecteurs

QPath répond d'abord par **déduction exacte** (0 token). Mais quand la question est **vague** ou
formulée autrement que la mémoire (« qui a plaidé coupable ? » vs le fait stocké), on cherche **par le
sens** : on transforme textes et faits en **vecteurs** et on trouve les plus proches. Le cœur ne dépend
d'aucune base vectorielle : elle entre par un **port**.

> 💡 **Complémentaire, pas concurrent.** Le symbolique (faits exacts) et le sémantique (proximité de
> sens) se combinent : on garde la précision des triplets **et** le rappel d'une recherche floue.

## Vectoriser du texte

`SemanticVectorizer` transforme un texte en vecteur 384-D (modèle MiniLM/e5), **100 % navigateur**
(Web Worker, aucune clé API). Il distingue **question** et **document** (modèles asymétriques).

```ts
import { SemanticVectorizer } from '@damba/libxn-embeddings';

const v = SemanticVectorizer.getInstance();
await v.ensureReady();                              // charge le modèle (idempotent, mis en cache)

const docVec = await v.embed('Paris est la capitale de la France', 'passage');  // 384 nombres
const qVec   = await v.embed('Où se trouve Paris ?', 'query');
const many   = await v.embedBatch(['…', '…'], 'passage');                        // lot efficace
```

- **`getInstance()` / `ensureReady(onProgress?)`** — singleton + chargement paresseux du modèle.
- **`embed(text, usage?)` → `Promise<number[]>`** — texte → vecteur ; `usage` = `'query'` ou `'passage'`.
- **`embedBatch(texts, usage?)` → `Promise<number[][]>`** — plusieurs textes en un seul aller-retour.

## Indexer & chercher des faits par le sens

`VectorGridStore` relie la mémoire QPath à une base vectorielle. On **indexe** les faits lisibles,
puis on **cherche** par une question en langage naturel.

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));

// Indexer les faits (s,p,o) → embeddings.
await store.syncSemanticFacts('dossier-1', [
  { s: 'jeremy mongrain', p: 'a_plaidé', o: 'coupable' },
  { s: 'paul', p: 'est', o: 'avocat' },
], v /* le SemanticVectorizer */);

// Chercher par le sens.
const hits = await store.searchSemantic('dossier-1', 'qui a plaidé coupable ?', v, 5);
//    → [{ score: 0.89, text: 'jeremy mongrain a_plaidé coupable', … }]
```

- **`syncSemanticFacts(key, facts, embedder, onProgress?)` → `Promise<{count}>`** — embed les faits et
  les range sous une clé (par projet/dossier).
- **`searchSemantic(key, query, embedder, limit?)` → `Promise<…>`** — embed la question + renvoie les
  faits les plus proches (score de 0 à 1).
- **`save(key, snapshot)` / `load(key)`** — persiste/recharge un instantané complet de grille.

## Le port `VectorStore` — Qdrant ou Postgres

Le moteur parle à une **interface** ; on branche l'implémentation voulue.

```ts
// Qdrant (REST, sans SDK)
import { QdrantVectorStore } from '@damba/libxn-qdrant';
const q = new QdrantVectorStore('http://localhost:6333');
await q.ensureCollection('faits', 384);
await q.upsert('faits', [{ id: 1, vector: qVec, payload: { text: '…' } }]);
const near = await q.search('faits', qVec, 10);

// Postgres + pgvector (même interface)
import { makeSql, pgVectorStore } from '@damba/libxn-postgres';
const pg = pgVectorStore(makeSql(process.env.DATABASE_URL!));
```

- **`ensureCollection(name, size)`** — crée la collection si absente. **`upsert(coll, points)`** —
  insère/maj des points `{ id, vector, payload }`. **`search(coll, vector, limit?)`** — les k plus
  proches (cosinus). Mêmes méthodes pour Qdrant **et** pgvector — l'app choisit le backend.

## Cas d'usage

| Situation | Comment |
|---|---|
| **RAG** : retrouver les faits pertinents pour un prompt | `syncSemanticFacts` puis `searchSemantic` |
| Question reformulée, fautes, synonymes (« toubib » ≈ « médecin ») | recherche par le sens (embeddings) |
| Détecter doublons / synonymes entre entités | comparer deux `embed()` (cosinus élevé) |
| Tout en local, sans clé API | `@damba/libxn-embeddings` (MiniLM en Web Worker) |

> 🔎 **Ordre conseillé.** Tenter d'abord la **lecture exacte** (`kb.ask`, raisonnement — 0 token), et ne
> basculer en **sémantique** que si rien n'est trouvé : précision d'abord, rappel ensuite.
