# Plot Reasoning

Un mode de raisonnement sur la **trame** (le *plot*) : les **événements**, leur **ordre** et leurs
**causes**. Là où la base de connaissances raisonne sur des faits intemporels (« le pingouin est un
oiseau »), le Plot Reasoning raisonne sur des faits **situés** :

```
négligence cause étincelle
étincelle cause incendie
incendie cause alarme
incendie cause évacuation
alarme précède évacuation
```

La trame d'un récit, d'un dossier d'enquête, d'un historique d'incidents — reconstruite depuis des
faits ordinaires, interrogeable en déterministe, **à 0 token**.

> 🎯 **Cas d'usage.** Analyser un incident : « qu'est-ce qui a causé l'incendie, et dans quel ordre les
> choses se sont-elles produites ? ». Plot remonte aux **causes racines**, **ordonne** les événements, et
> **repère les incohérences** (un rapport qui date un effet avant sa cause). Le problème résolu : raisonner
> sur le *temps* et la *causalité*, là où la mémoire de faits intemporels ne dit rien de l'ordre.

## Ce qu'il sait faire

| Question | Mécanisme | Exemple |
|----------|-----------|---------|
| « Qu'est-ce qui a mené à X ? » | remontée aux **causes racines** | `négligence —cause→ étincelle —cause→ incendie —cause→ évacuation` |
| « Quelles conséquences a eu X ? » | déroulé de la **clôture causale** | l'étincelle finit par provoquer incendie, alarme, évacuation |
| « Dans quel ordre ? » | **chronologie** (tri topologique ordre + causalité) | négligence → étincelle → incendie → alarme → évacuation |
| Trame suspecte | détection d'**incohérences** | une « cause » prouvée postérieure à son effet, ou un **cycle purement causal** (un effet qui re-cause sa propre cause), est signalé — une seule fois |
| « Qui ? Pourquoi ? » | acteurs et motifs déclarés des événements | `évacuation acteur gardien · motif sécurité` |

Chaque réponse porte sa **chaîne d'événements en preuve** — le « pourquoi » est auditable, comme
tout le reste de la mémoire.

## L'API en pratique

Le `PlotReasoner` se construit **par-dessus une `KnowledgeBase`** : il ne stocke rien lui-même, il
*lit* les faits déjà présents. On lui passe la KB, et — optionnellement — la liste des prédicats qui
font office d'arêtes causales / d'ordre.

```ts
import { PlotReasoner, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('négligence', 'cause', 'étincelle');
await kb.tell('étincelle', 'cause', 'incendie');
await kb.tell('incendie', 'cause', 'évacuation');
await kb.tell('alarme', 'précède', 'évacuation');

// undefined = encodeur par défaut ; headless = sans rendu (Node/serveur).
const plot = new PlotReasoner(kb);   // 2ᵉ argument (options) omis → conventions par défaut
```

Les **deux arguments du constructeur** :

- **`kb`** (`KnowledgeBase`, requis) — la mémoire à interpréter. Le `PlotReasoner` lit ses faits via
  `ask` / `askInverse` ; il ne mute jamais la KB.
- **`opts`** (`PlotOptions`, optionnel — `{}` par défaut) — quels prédicats traiter comme arêtes, et
  jusqu'où remonter. Détail ci-dessous.

### Les options (`PlotOptions`)

```ts
const plot = new PlotReasoner(kb, {
  causePredicates: ['cause', 'causes', 'leads_to'],   // remplace la liste par défaut
  orderPredicates: ['précède', 'before'],             // remplace la liste par défaut
  maxDepth: 12,                                        // chaînes plus longues
});
```

| Argument | Rôle | Défaut |
|---|---|---|
| `causePredicates?` | les prédicats lus comme **arêtes causales** (cause → effet). La liste **remplace** entièrement celle par défaut (elle ne s'y ajoute pas) ; les valeurs sont comparées en minuscules. | `['cause', 'causes', 'provoque', 'entraîne', 'entraine', 'déclenche', 'declenche']` |
| `orderPredicates?` | les prédicats lus comme **arêtes d'ordre** (a avant b), pour la chronologie et la détection d'incohérences. Remplace aussi la liste par défaut, comparé en minuscules. | `['précède', 'precede', 'precedes', 'avant', 'before']` |
| `maxDepth?` | profondeur maximale des chaînes causales remontées/déroulées — garde-fou borné qui garantit l'arrêt sur de gros graphes. | `8` |

> 💡 **Remplace, n'ajoute pas.** Passer `causePredicates: ['leads_to']` fait que `cause` n'est **plus**
> reconnu. Pour étendre les valeurs par défaut, recopie-les dans ta liste (`['cause', 'causes', 'leads_to']`).

### `why(event)` — remonter aux causes racines

```ts
const chains = plot.why('évacuation');
// chains[0].events  → ['négligence', 'étincelle', 'incendie', 'évacuation']
```

- **`event`** (`string`, requis) — l'événement dont on cherche les causes. Il est normalisé (casse /
  accents via `kb.normalize`) avant la recherche, donc `'Évacuation'` et `'évacuation'` se rejoignent.

**Retour : `PlotChain[]`** — *toutes* les chaînes causales qui remontent de `event` jusqu'à une cause
**racine** (un événement sans cause connue), triées par `confidence` décroissante puis par longueur
croissante. Tableau **vide** si l'événement n'a aucune cause connue. Chaque `PlotChain` vaut
`{ events, steps, confidence }` :

| Champ | Sens |
|---|---|
| `events` | les événements dans l'ordre **cause → effet** (le dernier est l'événement interrogé) |
| `steps` | les arêtes traversées (`{ s, p, o, count, confidence }`) — la **preuve** auditable |
| `confidence` | confiance de la chaîne = le **minimum** des confiances de ses arêtes (chaque arête causale affirmée vaut `1`) |

### `consequencesOf(event)` — dérouler les conséquences

```ts
const cons = plot.consequencesOf('étincelle');
const atteints = cons.map(c => c.events[c.events.length - 1]);
// → ['incendie', 'évacuation', …]  (clôture causale avant)
```

- **`event`** (`string`, requis) — l'événement dont on déroule la **clôture causale avant** : tout ce
  qu'il finit par provoquer, directement ou en cascade. Normalisé comme pour `why`.

**Retour : `PlotChain[]`** — une chaîne par conséquence atteinte (parcours en largeur, chaque nœud
visité une seule fois, borné par `maxDepth`). Même forme que `why`.

### `timeline()` — la chronologie

```ts
plot.timeline();
// → ['négligence', 'étincelle', 'incendie', 'alarme', 'évacuation']
```

Sans argument. **Retour : `string[]`** — *tous* les événements de la trame, triés par **tri
topologique** combinant arêtes d'ordre **et** arêtes causales (une cause précède son effet). À égalité,
l'ordre est **alphabétique** (déterministe). Les nœuds pris dans un cycle ne peuvent pas être ordonnés :
ils sont ajoutés **à la fin** (et signalés par `incoherences()`).

### `incoherences()` — la trame se défend

```ts
await kb.tell('évacuation', 'cause', 'alarme');   // ?! alarme précède évacuation
plot.incoherences();
// → [{ cause: 'évacuation', effect: 'alarme', reason: '…' }]
```

Sans argument. **Retour : `PlotIncoherence[]`** — les contradictions de la trame, chacune
`{ cause, effect, reason }` (`reason` = phrase lisible expliquant le conflit). Deux familles sont
détectées : (1) une arête causale dont l'ordre **prouvé** est inversé (l'effet précède la cause via les
arêtes d'ordre) ; (2) un **cycle purement causal** (un effet qui re-cause sa propre cause). Chaque
contradiction est **dédupliquée par paire** non-ordonnée → signalée **une seule fois**. Tableau vide si
la trame est saine.

### `actorsOf(event)` / `motivesOf(event)` — qui, et pourquoi

```ts
plot.actorsOf('évacuation');   // ['gardien']
plot.motivesOf('évacuation');  // ['sécurité']
```

- **`event`** (`string`, requis) — l'événement dont on lit les acteurs / motifs déclarés.

**Retour : `string[]`** — les valeurs déclarées. `actorsOf` lit les prédicats `acteur` **et** `actor` ;
`motivesOf` lit `motif` **et** `motive` (bilingues, en dur). Tableau vide si rien n'est déclaré.

### `PlotReasoner.format(chain)` — rendre une chaîne lisible

```ts
PlotReasoner.format(plot.why('incendie')[0]);
// → 'négligence —cause→ étincelle —cause→ incendie  (confiance 1.00)'
```

Méthode **statique**. **`chain`** (`PlotChain`, requis) — la chaîne à formater. **Retour : `string`**
— une ligne lisible `s —p→ o …  (confiance X.XX)`, ou `'(trame vide)'` si la chaîne n'a aucune arête.

### Le DSL `runQpathOp` — sans instancier le reasoner

Pour un appel ponctuel (routeur, outil LLM), `runQpathOp` instancie le `PlotReasoner` en interne et ne
renvoie que la **liste plate d'événements** :

```ts
import { runQpathOp } from '@damba/libxn';

runQpathOp(kb, 'why:évacuation');        // → ['négligence', 'étincelle', 'incendie']
runQpathOp(kb, 'consequences:étincelle'); // → ['incendie', 'alarme', 'évacuation']
runQpathOp(kb, 'timeline:');             // → la chronologie complète
```

Les **deux arguments** :

- **`kb`** (`KnowledgeBase`, requis) — la mémoire à interroger.
- **`op`** (`string`, requis) — l'opération sous forme `verbe:argument`. Pour le plot : `why:<event>`,
  `consequences:<event>`, `timeline:` (argument vide). Le `:` est obligatoire même quand l'argument
  est vide (`'timeline:'`).

**Retour : `string[]`** — la liste d'événements (sans les chaînes/preuves). `why:` renvoie tous les
événements impliqués dans les chaînes menant à la cible (la cible elle-même exclue) ; `consequences:`
les événements finaux atteints ; `timeline:` la chronologie. Pour la **preuve** (chaînes, confiance),
instancie le `PlotReasoner` directement.

## Les conventions

Tout est triplet ordinaire ; seuls les **prédicats** sont conventionnels (et configurables) :

- `cause` / `provoque` / `entraîne` / `déclenche` — arêtes causales ;
- `précède` / `avant` / `before` — arêtes d'ordre ;
- `acteur`, `motif` — qui agit, et pourquoi.

Un détail de sémantique qui compte : un événement qui cause **deux** choses n'affaiblit aucune des
deux — chaque arête causale affirmée est un fait plein (la confiance ne se dilue pas entre les
conséquences d'un même événement).

## D'où viennent les événements

Le raisonnement est 100 % déterministe ; **l'extraction** des événements depuis la prose, elle,
est le travail d'un extracteur (humain, ou LLM avec schéma événementiel). La provenance de chaque
arête dit toujours **qui a affirmé la causalité** — une cause *affirmée par un texte* n'est jamais
confondue avec une cause *prouvée*.

## Quand l'utiliser

| Situation | Mode conseillé |
|-----------|----------------|
| Propriétés, classes, attributs (« qui est quoi ») | déduction symbolique classique |
| Question décomposable en une passe | Flash reasoning |
| Raisonnement ouvert validé pas à pas | PingPong |
| **Récits, post-mortems, dossiers : « pourquoi », « qu'est-ce qui a mené à », « dans quel ordre »** | **Plot Reasoning** |
