# Flash reasoning · web · LLM (LangChain)

QPath reste le **cerveau** : il stocke les faits et raisonne de façon **déterministe, à 0 token**. On
peut lui ajouter deux couches de périphérie pour gagner en puissance, **sans lui retirer ce rôle** :

- **LangChain** = le connecteur LLM (verbalisation, décomposition d'une question). Le LLM ne décide
  rien et n'invente rien : il habille les faits que QPath fournit.
- **Tavily** = recherche web, pour combler un trou de connaissance. Les faits trouvés sont
  **ré-injectés dans QPath**, donc la mémoire grandit et reste réutilisable à 0 token ensuite.

> Principe : **QPath décide et mémorise ; le LLM verbalise ; le web complète.** Les réponses restent
> ancrées sur des faits vérifiables, pas sur les hallucinations du modèle.

## Installation

```bash
npm install @damba/libxn @langchain/anthropic @langchain/community
```

## 1. Connecter un LLM via LangChain

Un mince connecteur : QPath n'a besoin que d'un `prompt(text) → string`.

```ts
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({
  model: 'claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
  temperature: 0,           // déterministe : le LLM ne fait que reformuler
});

async function verbalize(prompt: string): Promise<string> {
  const res = await model.invoke(prompt);
  return String(res.content);
}
```

> N'importe quel modèle LangChain marche (`ChatOpenAI`, `ChatOllama`, `ChatMistralAI`…) : il suffit
> qu'il expose `invoke()`. QPath reste indépendant du fournisseur.

## 2. Recherche web avec Tavily

```ts
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';

const web = new TavilySearchResults({ maxResults: 5, apiKey: process.env.TAVILY_API_KEY });

async function searchWeb(query: string): Promise<string[]> {
  const raw = await web.invoke(query);             // JSON string
  return JSON.parse(raw).map((r: any) => `${r.title} — ${r.content}`);
}
```

## 3. Flash reasoning : QPath d'abord, web en secours, LLM pour finir

Le cœur du pattern. On interroge **toujours QPath en premier** (gratuit, instantané). On ne va sur le
web **que** si la mémoire ne couvre pas la question — et on **stocke** ce qu'on apprend.

```ts
import { XNeuroneGrid, KnowledgeBase, NaturalParser } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

async function flashAnswer(question: string, subject: string, predicate: string): Promise<string> {
  // ── 1. QPath d'abord : 0 token, déterministe ──
  let facts = kb.ask(subject, predicate);

  // ── 2. Trou de connaissance ? → web (Tavily), puis ré-injection dans QPath ──
  if (facts.length === 0) {
    const snippets = await searchWeb(question);
    for (const s of snippets) {
      const parsed = NaturalParser.parse(s);
      if (parsed.kind === 'statement') {
        await kb.tell(parsed.s, parsed.p, parsed.o);   // la mémoire grandit
      }
    }
    facts = kb.ask(subject, predicate);                // re-lecture depuis QPath
  }

  // ── 3. Le LLM verbalise, ancré sur les faits QPath (rien d'inventé) ──
  return verbalize(
    `Faits vérifiés (QPath) : ${facts.join(', ') || 'aucun'}\n` +
    `Question : ${question}\n` +
    `Réponds UNIQUEMENT à partir des faits ci-dessus. Si vide, dis-le.`,
  );
}
```

**Ce qu'on gagne.** La 2ᵉ fois qu'on pose une question proche, QPath répond seul — **0 token, 0 appel
web**. Le LLM n'est sollicité que pour la forme, et il est *grounded* : il ne peut pas contredire la
mémoire.

## 4. Raisonnement multi-sauts + trace (toujours QPath)

Même enrichi par le web, le raisonnement reste **déterministe et traçable** côté QPath :

```ts
import { ChainResolver } from '@damba/libxn';

const chain = new ChainResolver(kb).chain('socrate', 'a');
ChainResolver.format(chain!);
// → "socrate —est→ humain —est→ mortel —a→ fin  (⇒ a = fin, confiance 1.00, via transitive)"

// On peut ensuite faire verbaliser CETTE trace par le LLM, sans qu'il invente le chemin :
await verbalize(`Explique ce raisonnement en une phrase : ${ChainResolver.format(chain!)}`);
```

> **Confiance honnête, même à contre-sens.** Quand une chaîne emprunte une relation dans le sens
> **inverse**, sa confiance reflète celle du fait sous-jacent réel — pas une certitude supposée. Une
> conclusion tirée d'un maillon inverse incertain n'est donc plus artificiellement sur-confiante.

## 5. Quand le raisonnement dépasse QPath → déléguer au LLM

QPath est imbattable sur le raisonnement **symbolique et déterministe** (héritage, transitivité,
compositions déclarées). Mais certains raisonnements le dépassent : questions **ouvertes ou floues**,
**jointures multi-variables** (style « qui est le grand-parent de X via deux relations »), inférences
de **bon sens**, synthèse **créative**. Là, on **délègue au LLM** — mais en lui donnant les faits QPath
comme socle, pour qu'il raisonne *à partir du vérifiable* plutôt que dans le vide.

Le pattern est une **escalade** : QPath tente d'abord (déterministe, 0 token) ; s'il ne conclut pas, le
LLM prend le relais avec le contexte QPath.

```ts
import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const resolver = new ChainResolver(kb);

async function reason(subject: string, predicate: string, question: string): Promise<string> {
  // ── 1. QPath d'abord : raisonnement déterministe et traçable ──
  const chain = resolver.chain(subject, predicate);
  if (chain) {
    return ChainResolver.format(chain);            // réponse exacte, 0 token, prouvée
  }

  // ── 2. Hors de portée de QPath → on délègue au LLM, ancré sur les faits connus ──
  const facts = kb.askDeep(subject, 2);            // tout ce que QPath sait du sujet (multi-sauts)
  return verbalize(
    `Faits vérifiés (QPath) :\n${facts.map(f => `- ${f.via.join(' → ')} : ${f.value}`).join('\n') || 'aucun'}\n\n` +
    `Question (raisonnement complexe) : ${question}\n` +
    `Raisonne à partir des faits ci-dessus. Distingue ce qui est certain (issu des faits) ` +
    `de ce qui est une hypothèse.`,
  );
}
```

**La règle.** Tout ce qui *peut* être résolu par QPath l'est — déterministe, gratuit, prouvé. Le LLM
n'intervient que sur le **résidu** que le symbolique ne couvre pas, et reste **ancré** : il sépare
explicitement le certain (faits QPath) de l'hypothétique. On garde le meilleur des deux : la rigueur de
QPath **et** la souplesse du LLM, sans payer la souplesse partout.

> Note : les jointures multi-variables font partie de la **roadmap** de QPath — au fur et à mesure que
> le noyau les couvre, la part déléguée au LLM diminue. La frontière se déplace vers QPath, pas l'inverse.

## Pourquoi cette architecture

| Couche | Rôle | Coût |
|--------|------|------|
| **QPath** (`@damba/libxn`) | mémoire + raisonnement déterministe (priorité) | 0 token, instantané |
| **Tavily** (LangChain) | faits frais du web, ré-injectés dans QPath | 1 appel, **une seule fois** |
| **LLM** (LangChain) | verbalisation + raisonnement complexe hors-portée, ancré sur QPath | tokens minimisés |

Résultat : moins d'appels, moins de tokens, **pas d'hallucination** (tout est ancré sur une mémoire
vérifiable), et une connaissance qui **s'accumule** au lieu d'être re-payée à chaque tour.
