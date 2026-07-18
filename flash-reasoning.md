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

Le constructeur `new ChatAnthropic({...})` (paquet externe `@langchain/anthropic`) prend un objet d'options :

| Argument | Rôle | Défaut |
|---|---|---|
| `model` | l'identifiant du modèle à appeler (ex. `'claude-sonnet-4-6'`) | dépend de la version du paquet |
| `apiKey` | la clé d'API ; à lire depuis l'environnement, jamais en dur | `process.env.ANTHROPIC_API_KEY` si omis |
| `temperature` | l'aléa de génération ; `0` = sortie déterministe (le LLM ne fait que reformuler, il n'invente pas) | dépend du paquet |

`model.invoke(prompt)` accepte le **texte du prompt** (string) et renvoie un objet message ; on en
extrait le texte via `res.content` (d'où le `String(res.content)` qui le normalise en chaîne). Notre
fonction `verbalize` n'expose donc que ce dont QPath a besoin : un `prompt(text) → string`.

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

Le constructeur `new TavilySearchResults({...})` (paquet externe `@langchain/community`) :

- **`maxResults`** — le nombre maximum de résultats web renvoyés par requête (ici `5`). Plus c'est
  haut, plus on a de matière à ré-injecter, mais plus l'appel est coûteux.
- **`apiKey`** — la clé d'API Tavily, lue depuis l'environnement (`process.env.TAVILY_API_KEY`).

`web.invoke(query)` prend la **requête de recherche** (string) et renvoie une **chaîne JSON** (d'où le
`JSON.parse(raw)`) : un tableau d'objets résultats dont on n'utilise ici que `title` et `content`.

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

Les fonctions QPath utilisées ci-dessus :

`new XNeuroneGrid(undefined, { headless: true })` — construit le graphe en mémoire :

| Argument | Rôle | Défaut |
|---|---|---|
| `encoder?` | l'encodeur input → paires binaires ; `undefined` = encodeur par défaut (`BinaryConverter.toBinaryPairs`) | `undefined` |
| `opts.headless?` | `true` = aucun rendu attaché (Node/serveur) ; en mode visuel un `viewFactory` doit être enregistré | `false` |

`new KnowledgeBase(grid)` — prend **un seul argument**, la grille QPath à raisonner par-dessus ; il
reconstruit ses index au démarrage (utile si la grille vient d'un snapshot rechargé).

`kb.ask(subject, predicate)` — deux arguments, le **sujet** et le **prédicat** ; renvoie le **tableau
des objets** `string[]` stockés pour ce couple (fusion d'alias incluse), `[]` si rien. C'est la lecture
déterministe à 0 token.

`kb.tell(s, p, o, source?, flags?)` — enregistre un fait. Les trois premiers (sujet, prédicat, objet)
sont requis ; `source?` attache la provenance et `flags?` les drapeaux (`closed`, `major`…) — tous deux
optionnels et omis ici. Asynchrone ; renvoie un `ContradictionReport` si l'opposé exact existe déjà,
sinon `null`.

`NaturalParser.parse(text)` — méthode **statique**, un seul argument (le texte libre). Renvoie un
`ParsedInput` discriminé par `kind` :
- `'statement'` → `{ kind, s, p, o }` (une affirmation, le seul cas qu'on stocke ici) ;
- `'what'` / `'yesno'` / `'list'` → une **question** (jamais stockée) ;
- `'unknown'` → `{ kind, text }` (non interprétable).

> 💡 On ne `tell` que sur `kind === 'statement'` : une question (`what`/`yesno`/`list`) ne doit jamais
> polluer la mémoire. Tester `parsed.kind` avant d'accéder à `parsed.s/p/o` est obligatoire — ces
> champs n'existent pas sur les autres variantes (TypeScript le vérifie).

**Ce qu'on gagne.** La 2ᵉ fois qu'on pose une question proche, QPath répond seul — **0 token, 0 appel
web**. Le LLM n'est sollicité que pour la forme, et il est *grounded* : il ne peut pas contredire la
mémoire.

## 4. Raisonnement multi-sauts + trace (toujours QPath)

**Le problème.** Beaucoup de réponses ne sont écrites nulle part : elles se **déduisent** en enchaînant
plusieurs faits. « Léa est-elle la grand-mère de Paul ? » n'est pas un fait stocké, mais se déduit de
« Léa est parente de Marie » et « Marie est parente de Paul ». Il faut donc **composer des maillons**, et,
pour rester auditable, **montrer le chemin** qui mène à la conclusion.

`ChainResolver` fait exactement cela, à 0 token, et rend une **trace lisible** : le chemin EST l'explication.

```ts
import { KnowledgeBase, XNeuroneGrid, ChainResolver, PredicateAlgebra } from '@damba/libxn';

// La KB de travail (ici on l'alimente à la main ; en vrai, ces faits viennent de l'ingestion).
const kb = new KnowledgeBase(new XNeuroneGrid());
await kb.tell('lea', 'parent_de', 'marie');
await kb.tell('marie', 'parent_de', 'paul');

// L'algèbre déclare COMMENT composer : deux 'parent_de' à la suite valent un 'grand_parent_de'.
const algebra = PredicateAlgebra.withDefaults()
  .declareComposition('parent_de', 'parent_de', 'grand_parent_de');

// Cherche une chaîne de 'lea' vers un objet via le prédicat COMPOSÉ 'grand_parent_de'.
const chain = new ChainResolver(kb, algebra).chain('lea', 'grand_parent_de');

ChainResolver.format(chain!);
// → "lea —parent_de→ marie —parent_de→ paul  (⇒ grand_parent_de = paul, confiance 1.00)"
```

**Le point clé** : la conclusion (« grand_parent_de = paul ») arrive **avec son chemin**. On peut ensuite
demander à un LLM de mettre cette trace en une phrase, **sans qu'il invente le raisonnement** — il ne fait
que verbaliser un chemin déjà prouvé par QPath.

Les trois pièces, brièvement :

- **`new ChainResolver(kb, algebra?)`** — le résolveur, sur une `KnowledgeBase`. Sans `algebra`, il prend
  `PredicateAlgebra.withDefaults()` ; on ne la passe que pour des compositions sur-mesure (comme ci-dessus).
- **`chain(s, targetP)`** — la **plus courte** chaîne reliant `s` à un objet via le prédicat composé
  `targetP`. Renvoie un `ReasoningChain` (maillons, conclusion, confiance), ou **`null`** si aucune chaîne
  n'existe (d'où le `chain!` quand on sait qu'elle existe). Bornée en profondeur ; la confiance agrège les
  maillons (par défaut, celle du maillon le plus faible).
- **`ChainResolver.format(chain)`** — statique ; transforme un `ReasoningChain` en une **trace lisible en
  une ligne**.

**Cas d'usage.** Répondre à une question de parenté / hiérarchie / localisation que personne n'a saisie
telle quelle (« sa grand-mère ? », « dans quel continent ? »), en fournissant la **preuve** du raisonnement,
pas seulement le résultat.

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

`kb.askDeep(s, maxDepth?)` — recherche **BFS multi-prédicat** : tout ce que QPath sait du sujet `s` en
suivant n'importe quel prédicat jusqu'à `maxDepth` sauts.

- **`s`** — le sujet de départ (requis).
- **`maxDepth?`** — le nombre maximum de sauts ; par défaut `3` (ici on passe `2`).

Renvoie un tableau `{ value: string; via: string[] }[]` : chaque objet atteignable avec la **chaîne de
prédicats** (`via`) qui y mène — d'où le `f.via.join(' → ')` et `f.value` dans la construction du prompt.

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
