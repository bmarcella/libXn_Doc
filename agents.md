# Agents & RAG

Le paquet `@damba/libxn-agents` relie la mémoire QPath à un LLM **sans dépendances en dur** : la
récupération multi-sources (`Retriever`), un protocole compact LLM↔QPath (`QPathDSL`), un
orchestrateur conversationnel (`LLMOrchestrator`) et des **agents autonomes** (curation, recherche,
pédagogie). Tous les transports (LLM, web, sémantique) entrent par des **ports** injectés.

> 💡 **Le LLM converse, QPath se souvient.** Le modèle apporte le langage ; la mémoire apporte les
> faits exacts, traçables et persistants. L'un ne remplace pas l'autre.

## Récupérer depuis plusieurs sources

```ts
import { Retriever } from '@damba/libxn-agents';

const retriever = new Retriever(kb, semanticIndex, webSearcher);

const hits = await retriever.retrieve('alice travaille', {
  strategy: 'symbolic-first',          // 'symbolic-first' | 'semantic-first' | 'hybrid' | 'web-fallback'
  sources: ['symbolic', 'semantic', 'web'],
  limit: 5,
});
//    → [{ content: 'alice travaille libxn', source: 'symbolic', score: 0.95 }, …]
```

- **`new Retriever(kb, semanticIndex?, webSearcher?)`** — unifie mémoire symbolique, index sémantique
  et web. **`retrieve(query, opts)` → `Promise<RetrievalResult[]>`** — renvoie des extraits scorés selon
  la **stratégie** (l'exact d'abord, le web en secours, ou un mélange).

## Parler à la mémoire en peu de tokens — QPathDSL

Plutôt qu'un gros JSON, le LLM lit/écrit la mémoire via une grammaire compacte (≈ **−75 % de tokens**).

```ts
import { parse, execute } from '@damba/libxn-agents';

await execute(parse('?alice.travaille'), kb, retriever);   // faits directs → 'alice travaille libxn'
await execute(parse('??alice.collègue'), kb, retriever);   // raisonnement multi-saut (?? = 2-3 hops)
await execute(parse('?age>60'), kb, retriever);            // numérique → 'bob age 71'
await execute(parse('alice travaille libxn'), kb, retriever); // écrit le fait
```

| Syntaxe | Effet |
|---|---|
| `?x` | index d'un sujet (ses prédicats) |
| `?x.p` | faits directs `(x, p, ?)` |
| `??x.p` | raisonnement multi-saut (héritage/chaîne) |
| `?x p y` | vérifie un triplet → `y`/`n` |
| `x p y` | écrit le triplet (`tell`) |
| `?avg:p` · `?count:x.p` | agrégats déterministes |

- **`parse(cmd)` → `Command`** puis **`execute(cmd, kb, retriever)` → sortie compacte** — lire, écrire,
  agréger, raisonner, en quelques caractères.

## Un assistant qui se souvient

```ts
import { LLMOrchestrator } from '@damba/libxn-agents';

const orch = new LLMOrchestrator(llmChatPort, kb, retriever);
const { response, toolCalls, inputTokens } = await orch.chat('Qui travaille où ?', history);
```

- **`new LLMOrchestrator(llmChatPort, kb, retriever, model?)`** — un seul outil `q(cmd)` (DSL) exposé au
  LLM, au lieu de multiples outils JSON. **`chat(message, history, toolNames?)` → `Promise<{ response, toolCalls, … }>`**
  — un tour : le modèle interroge/écrit la mémoire via le DSL, puis synthétise.

## Des agents autonomes

```ts
import { CuratorAgent, ResearcherAgent, TutorAgent } from '@damba/libxn-agents';

await new CuratorAgent(llm, kb, retriever).run('');                 // audite la KB (contradictions, doublons)
await new ResearcherAgent(llm, kb, retriever, web, { targetFactsCount: 20 }).run('immunothérapie');
await new TutorAgent(llm, kb, retriever).run('relativité');         // interroge l'utilisateur sur la KB
```

- **`CuratorAgent`** — audite la mémoire (contradictions, doublons, faits faibles) et **propose** des
  corrections. **`ResearcherAgent`** — boucle web→faits jusqu'à atteindre un objectif de faits appris.
  **`TutorAgent`** — pose des questions ancrées dans la KB. Tous via **`run(input, opts?)` → `AgentResult`**
  (borné par `maxIterations`), le LLM **auteur**, l'écriture validée.

## Documents longs

```ts
import { DocumentStore } from '@damba/libxn-agents';

const docs = new DocumentStore(kb);
await docs.add({ title: 'CV Marcella', content: '…', entities: ['marcella', 'libxn'] });
docs.findByEntity('libxn');     // documents mentionnant l'entité
```

- **`DocumentStore`** — garde les contenus longs (CV, articles) **et** croise les mentions dans la KB :
  **`add(doc)`**, **`findByEntity(e)`**, **`findRecent(ms)`**, **`get/list/remove`**.

## Cas d'usage

| Situation | Brique |
|---|---|
| Chatbot avec **mémoire persistante** qui grandit | `LLMOrchestrator` + `Retriever` |
| RAG hybride (faits exacts + sens + web) | `Retriever` (4 stratégies) |
| Réduire le coût tokens des échanges LLM↔mémoire | `QPathDSL` |
| **Nettoyer** une grosse mémoire automatiquement | `CuratorAgent` |
| **Enrichir** un sujet depuis le web, sans surveiller | `ResearcherAgent` |

> 🔌 **Ports, pas de dépendances.** `LlmChatPort`, `SearchPort`, `SemanticIndexPort` : l'app branche son
> LLM, son moteur de recherche et son index. Aucune URL ni clé dans le paquet.
