# Outils (Tools)

Les **outils** étendent QPath au-delà de sa mémoire : un dev écrit une capacité (recherche web, calcul,
API, requête SQL…) que **QPath peut appeler pour combler un manque**. C'est l'équivalent du
« function-calling » des LLM, **mais ancré sur QPath** : ce que l'outil ramène devient des **faits
mémorisés, auditables et réutilisables à 0 token**.

> **QPath ne sait pas → il appelle un outil → l'outil renvoie des faits → QPath les mémorise.**

## Écrire un outil

Un outil est un objet qui implémente le port `Tool` : un nom, une description, et un `run`. Il renvoie
des **faits** (triplets) et/ou une **valeur** directe.

```ts
import { Tool, ToolResult } from '@damba/libxn';

const weather: Tool = {
  name: 'weather',
  description: 'Météo actuelle d\'une ville',
  resolves: ['weather_of'],                       // (optionnel) prédicat qu'il sait résoudre
  async run(input): Promise<ToolResult> {
    const city = String(input['subject'] ?? input['query']);
    const data = await fetchWeather(city);
    return {
      facts: [[city, 'weather_of', data.condition]],  // → mémorisé dans QPath
      value: data,                                // → réponse directe optionnelle
    };
  },
};
```

**Les champs de l'objet `Tool`** (le port que tu implémentes) :

| Champ | Rôle | Défaut |
|---|---|---|
| `name` | identifiant unique de l'outil (sert à l'appel piloté par le LLM, `TOOL <name>`) | — (requis) |
| `description` | description courte — sert à la sélection (par le LLM ou en doc) | — (requis) |
| `resolves?` | liste de prédicats que l'outil sait résoudre → **liaison déterministe** (appelé sur cache-miss de `(s, p)`) | `undefined` (jamais déclenché en mode déterministe) |
| `ephemeral?` | si `true`, **aucun** fait de cet outil n'est jamais mémorisé (donnée dynamique par nature) | `false` |
| `run` | la fonction qui exécute l'outil ; voir ci-dessous | — (requis) |

`run(input)` reçoit **un seul argument** : `input: Record<string, unknown>` — un sac de clés/valeurs
**libre**. En mode déterministe, le noyau le remplit avec `{ subject, predicate }` ; piloté par le LLM,
ce sont les `args` du coup `TOOL`. D'où le `input['subject'] ?? input['query']` : tu lis la clé que ton
outil attend, avec un repli. `run` renvoie une **`Promise<ToolResult>`**.

**Les champs de l'objet `ToolResult`** (ce que `run` retourne) — **tous optionnels** :

| Champ | Rôle | Défaut |
|---|---|---|
| `facts?` | triplets `[sujet, prédicat, objet]` → **mémorisés** dans la KB (sauf si volatile) | `undefined` (rien à mémoriser) |
| `value?` | réponse directe (calcul, objet de données, statut…), **non** mémorisée | `undefined` |
| `text?` | texte lisible optionnel, pour la trace de raisonnement | `undefined` |
| `ephemeral?` | marque **ce résultat précis** comme volatile (l'emporte sur `Tool.ephemeral`) | hérite de `Tool.ephemeral`, sinon `false` |

On enregistre les outils dans un **registre** :

```ts
import { ToolRegistry } from '@damba/libxn';
const tools = new ToolRegistry().register(weather);
```

`new ToolRegistry()` ne prend **aucun argument**. `register(tool)` prend **un** outil et **retourne le
registre lui-même** (`this`) — d'où le chaînage `new ToolRegistry().register(a).register(b)`. Sous le
capot il indexe l'outil par `name` (appel explicite) et par chaque prédicat de `resolves` (liaison
déterministe). Les autres méthodes du registre : `get(name)` → `Tool | undefined`,
`byPredicate(p)` → `Tool | undefined`, `list()` → `Tool[]`.

> Sous le capot, c'est `ingestToolResult(kb, result, opts?)` (exporté) qui écrit les faits d'un
> `ToolResult` dans la KB **avec leur provenance** ; les deux déclencheurs ci-dessous l'utilisent
> (`resolveWithTools` et le coup `TOOL` de PingPong).

`ingestToolResult` prend **trois** arguments — `ingestToolResult(kb, result, opts?)` :

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la `KnowledgeBase` où écrire les faits | — (requis) |
| `result` | le `ToolResult` dont on ingère le champ `facts` | — (requis) |
| `opts?` | options d'écriture `{ ephemeral?, source? }` — voir ci-dessous | `{}` |

Les champs de `opts` : `ephemeral?` (si `true`, **rien** n'est écrit → retourne `[]`) et `source?`
(la **provenance** attachée à chaque fait, typiquement `{ kind: 'tool', ref: tool.name }` — c'est elle
qui permettra plus tard de rappeler le même outil pour revérifier). La fonction **retourne** la liste
des faits réellement écrits : `Array<{ s: string; p: string; o: string }>` (vide si volatile).

## Deux façons de déclencher un outil

### 1. Déterministe (liaison de prédicat) — sans LLM

Si un outil déclare `resolves: ['weather_of']`, QPath l'appelle automatiquement quand il ignore `(s, weather_of)` :

```ts
import { resolveWithTools } from '@damba/libxn';

const r = await resolveWithTools(kb, tools, 'paris', 'weather_of');
// QPath ne savait pas → l'outil tourne → le fait est mémorisé → r.objects = ['rain']
// La prochaine fois, QPath répond seul : 0 token, 0 appel d'outil.
```

`resolveWithTools` prend **quatre** arguments — `resolveWithTools(kb, registry, s, p)` :

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la `KnowledgeBase` interrogée (et où le fait sera mémorisé) | — (requis) |
| `registry` | le `ToolRegistry` dans lequel chercher l'outil lié au prédicat | — (requis) |
| `s` | le **sujet** de la question `(s, p)` | — (requis) |
| `p` | le **prédicat** ; si QPath l'ignore et qu'un outil déclare `resolves: [p]`, l'outil est appelé | — (requis) |

La fonction **retourne** un `ResolveWithToolsResult` :

| Champ | Sens |
|---|---|
| `objects` | les objets de `(s, p)` après éventuel appel d'outil (relus depuis la KB → cohérents avec ce qui est réellement interrogeable) |
| `usedTool?` | nom de l'outil appelé, ou `undefined` si QPath savait déjà / aucun outil lié |
| `learned` | faits réellement ajoutés à la KB — `[]` si QPath savait déjà ou si la réponse était volatile |
| `ephemeral?` | `true` si la réponse de l'outil était volatile (non mémorisée) |

> 💡 Si QPath connaît déjà `(s, p)`, **aucun outil n'est appelé** : `objects` vient de la mémoire,
> `learned` est `[]` et `usedTool` reste `undefined` — c'est tout l'intérêt (0 token, 0 appel réseau
> au second passage).

Reproductible, traçable, sans LLM.

### 2. Piloté par le LLM (coup TOOL dans PingPong)

En [PingPong reasoning](/pingpong-reasoning), le LLM peut jouer un coup `TOOL` ; l'outil tourne, ses faits
entrent dans QPath, et l'échange continue — ancré.

```ts
import { PingPongReasoner } from '@damba/libxn';

const result = await new PingPongReasoner(kb, llm, { tools }).run('Quel temps fait-il à Paris ?');
// Le LLM joue : TOOL weather | city=paris  → QPath mémorise (paris, weather_of, rain) → CONCLUDE
result.factsLearned;   // [{ s: 'paris', p: 'weather_of', o: 'rain' }]
```

Le **constructeur** `new PingPongReasoner(kb, llm, opts?)` prend **trois** arguments :

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la `KnowledgeBase` qui sert d'arbitre déterministe (vérifie chaque coup du LLM) | — (requis) |
| `llm` | le port `LlmPort` (le moteur de langage qui joue les coups) | — (requis) |
| `opts?` | options du raisonneur — voir ci-dessous | `{}` |

Champs de `opts` (tous optionnels) : `tools?` (le `ToolRegistry` mis à disposition pour les coups
`TOOL`), `maxRounds?` (échanges max, **défaut 3**), `writeBack?` (réinjecter les hypothèses vérifiées
dans la KB, **défaut `true`**), `confidence?` (politique de confiance passée à `ChainResolver`),
`algebra?` (algèbre de prédicats ; défaut `PredicateAlgebra.withDefaults()`).

`.run(question, opts?)` prend la **question** (chaîne, requise) et un second argument `opts?` optionnel
qui **surcharge ponctuellement** les options du constructeur pour cet appel (`maxRounds`, `writeBack`,
`confidence`, plus `seedSubject?` — un sujet de départ dont les faits connus amorcent le LLM — et
`systemPrompt?`). Il **retourne** une `Promise<PingPongResult>` dont les champs utiles ici :
`conclusion` (la réponse finale), `factsLearned` (les faits écrits pendant l'échange),
`grounded` (booléen : tout est-il ancré sur QPath), `llmCalls` (nombre d'appels LLM) et
`stopped` (`'concluded'` | `'maxRounds'` | `'stalled'`).

## Lire la KB : le LLM interroge la mémoire

Tous les outils ci-dessus *apportent* de la donnée externe. Mais un outil peut faire l'inverse :
**lire la mémoire déterministe** pour que le LLM réponde **à partir des faits**, jamais de tête. Le
`run` interroge la `KnowledgeBase` (`ask`, `askInverse`, `compute`, `askInherited`…) et renvoie la
réponse — **sans rien mémoriser** (c'est une lecture : `ephemeral: true`).

```ts
import { Tool, ToolResult, KnowledgeBase, type AggregateFn } from '@damba/libxn';

/** Outil de LECTURE : le LLM interroge la mémoire de la conversation (aucun fait écrit). */
class KbQueryTool implements Tool {
  name = 'kb_query';
  description = 'Interroge la mémoire. Args : subject=<s> predicate=<p> (valeurs connues), '
    + 'predicate=<p> object=<o> (sujets), ou compute=<p>:<fn> (avg|sum|count|min|max).';
  ephemeral = true;                       // lecture pure : rien à mémoriser

  constructor(private kb: KnowledgeBase) {}

  async run(input: Record<string, unknown>): Promise<ToolResult> {
    const s = String(input['subject'] ?? '').trim();
    const p = String(input['predicate'] ?? '').trim();
    const o = String(input['object'] ?? '').trim();
    const compute = String(input['compute'] ?? '').trim();   // ex : age:avg

    if (compute) {
      const [pred, fn] = compute.split(':');
      const v = this.kb.compute({ p: pred }, fn as AggregateFn);
      return { value: v, text: v === undefined ? '∅' : String(v) };
    }
    if (s && p) { const r = this.kb.ask(s, p);        return { value: r, text: r.join(', ') || '∅' }; }
    if (p && o) { const r = this.kb.askInverse(p, o); return { value: r, text: r.join(', ') || '∅' }; }
    return { text: 'args : subject=/predicate=/object= ou compute=<p>:<fn>' };
  }
}
```

Les **méthodes de lecture de la KB** utilisées dans ce `run` :

- **`kb.ask(s, p)`** — lecture **directe** : prend le sujet `s` et le prédicat `p`, **retourne** la liste
  des objets `string[]` (ex. la ville d'Alice). Vide si inconnu.
- **`kb.askInverse(p, o)`** — lecture **inverse** : prend le prédicat `p` et l'objet `o`, **retourne**
  les **sujets** `string[]` qui satisfont `(?, p, o)` (ex. « qui habite à Paris ? »).
- **`kb.compute(filter, fn)`** — agrégat déterministe (0 token). Premier argument : un **filtre** de
  faits `{ s?, p?, o? }` (ici `{ p: pred }` = « tous les faits de prédicat `pred` »). Second argument :
  la **fonction d'agrégat** `fn` de type `AggregateFn` — l'une de
  `'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'variance' | 'stddev' | 'range'`. **Retourne**
  un `number`, ou **`undefined`** si aucun fait numérique ne correspond (d'où le `v === undefined ? '∅'`).
  `count` compte les faits ; les autres ne portent que sur les objets **numériques**.

> 💡 `ephemeral = true` sur la classe : c'est une **lecture pure**, donc même si elle renvoyait des
> `facts` ils ne seraient pas mémorisés. Ici elle ne renvoie d'ailleurs que `value`/`text`.

On le branche comme n'importe quel outil ; le LLM l'appelle via un coup `TOOL` dans PingPong :

```ts
import { ToolRegistry, PingPongReasoner } from '@damba/libxn';

const tools = new ToolRegistry().register(new KbQueryTool(kb));
await new PingPongReasoner(kb, llm, { tools }).run('Quel est l\'âge moyen des clients ?');
// Le LLM joue : TOOL kb_query | compute=age:avg → la KB calcule → réponse ancrée, calcul à 0 token
```

Mêmes signatures que plus haut : `KbQueryTool` reçoit la `kb` dans son **constructeur** (l'outil de
lecture a besoin d'une référence vers la mémoire à interroger), puis `register(...)` l'ajoute au
registre, et `PingPongReasoner(kb, llm, { tools })` reçoit ce registre via l'option `tools`.

> **Lire vs apporter** : un outil de **lecture** renvoie `value`/`text` (rien n'est mémorisé) ; un
> outil qui **comble un manque** renvoie `facts` (mémorisés). Tu peux restreindre la lecture par les
> **droits** (`FactVault` / `FactAccessControl`) pour que le LLM ne voie que les faits autorisés de la
> session — secrets déchiffrés seulement si la session le permet.

### Cas d'usage

| Assistant | Le LLM appelle | La KB répond |
|---|---|---|
| **Damba Banque** | `kb_query \| subject=compte-42 predicate=solde` | le **vrai** solde (jamais inventé) ; `compute=depot:sum` → total déposé |
| **Cabinet d'avocat** | `kb_query \| subject=dossier-17 predicate=clause` | les clauses du dossier — le LLM rédige **à partir** d'elles |
| **Médecin** | `kb_query \| subject=patient-9 predicate=allergie` | les antécédents réels — pas d'hallucination clinique |
| **Mémoire d'équipe** | `org_memory \| subject=alice predicate=poste` | la mémoire **partagée** de l'organisation (côté serveur) |

Le LLM **comprend** la question et **choisit** l'outil ; QPath **exécute** et **prouve**. La réponse
reste ancrée sur des faits vérifiables.

## Réponses dynamiques (volatiles)

Certaines réponses ne doivent **pas** être mémorisées : météo, cours de bourse, heure, statut serveur…
Les écrire dans QPath créerait des **faits périmés**. Marque alors l'outil (ou un appel précis) comme
**volatile** (`ephemeral`) : QPath **utilise** la réponse pour ce tour, mais ne la **mémorise pas** — et
rappelle donc l'outil la prochaine fois (valeur fraîche).

```ts
const weather: Tool = {
  name: 'weather',
  description: 'Météo actuelle',
  resolves: ['weather_of'],
  ephemeral: true,                         // ← jamais mémorisé (donnée dynamique)
  async run(input) {
    const city = String(input['subject'] ?? input['query']);
    return { facts: [[city, 'weather_of', await currentWeather(city)]] };
  },
};
```

Ici `ephemeral: true` est posé **sur l'outil** (champ `Tool.ephemeral`) : il s'applique à **tous** ses
appels. Pour un outil **parfois** stable, **parfois** volatile, laisse l'outil par défaut et pose le
drapeau **par appel** dans le `ToolResult` retourné (`return { facts: [...], ephemeral: true }`) — le
`ToolResult.ephemeral` l'emporte sur le défaut de l'outil.

- **Au niveau de l'outil** : `ephemeral: true` → toutes ses réponses sont volatiles.
- **Par appel** : `return { facts: [...], ephemeral: true }` → l'emporte sur le défaut de l'outil
  (utile pour un outil parfois stable, parfois volatile).

À l'inverse, un fait **stable** (capitale d'un pays, relation métier…) est mémorisé normalement et
réutilisé à 0 token.

## Pourquoi c'est utile

- **La mémoire grandit** — un fait ramené par un outil est mémorisé : on ne le re-cherche pas deux fois.
- **Ancrage** — les résultats deviennent des faits QPath, donc **auditables** (pas une réponse opaque).
  Une fois les faits durables mémorisés, la réponse renvoyée correspond **exactement** à ce qui est
  réellement interrogeable dans la mémoire — même si l'outil avait normalisé le sujet sous une autre
  forme : aucun écart entre ce que l'outil annonce et ce que QPath sait.
- **Découplé** — l'outil est un **port** : le noyau ne dépend d'aucune API. Le dev branche ce qu'il veut
  (web, calcul, base interne…) sans toucher à QPath.

## Idées d'outils

| Outil | Apporte à QPath |
|-------|-----------------|
| Recherche web (Tavily, Brave…) | faits frais du web |
| Calculatrice / unités | résultats numériques exacts |
| Base de données interne | faits métier à jour |
| API tierce (météo, géo, finance…) | données en temps réel |
| Lecteur de documents | faits extraits de PDF/notes |

::: tip
Le fonctionnement interne de QPath n'est pas documenté publiquement. Pour un accès technique ou un
partenariat, contactez l'auteur. Voir aussi [PingPong reasoning](/pingpong-reasoning) et
[Composants clés](/components).
:::
