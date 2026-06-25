# Dépannage & FAQ

Les problèmes les plus courants, et leur résolution.

## `npm install` échoue avec une 404 sur `@damba/...`

Les paquets `@damba/*` ne sont **pas encore publiés sur npm** (pré-1.0). En dehors du monorepo, installez
avec :

```bash
npm install --legacy-peer-deps
```

Les peer dependencies `@damba/*` sont alors ignorées à la résolution ; vous les fournissez localement
(sources ou `dist` du monorepo).

## Au runtime : « X is not exported by @damba/libxn »

Symptôme typique : un symbole existe dans les **types** (`.d.ts`) mais pas dans le **runtime** (`.js`). Le
`dist` du cœur est **périmé** par rapport aux sources. Reconstruisez-le :

```bash
cd packages/libxn && npm run build
```

Règle générale : **après toute édition de `packages/**`, reconstruire le `dist`** (les tests consomment les
sources, mais un serveur consomme le `dist`).

## `distinctValues({ p: 'est' })` renvoie `[]`

Voulu, mais piégeux : les agrégats-sur-objets (`distinctValues`, `frequencies`, `mode`, `concat`…)
**excluent les prédicats réservés** (`est`, `est_un`, `same_as`…) pour ne pas polluer les résultats avec
l'ontologie. Pour cibler quand même un prédicat réservé :

```ts
kb.matchFacts({ p: 'est' });                       // -> les faits (s,p,o)
kb.matchFacts({ p: 'est' }).map(f => f.o);         // -> les objets
// ou, là où le flag est exposé :
kb.matchFacts({ p: 'est', excludeReserved: false });
```

## La vue 3D « fuit » / « WebGL context lost » après plusieurs ouvertures

Une vue Three.js non libérée garde son contexte GPU (plafond du navigateur ~16 par onglet). **Appelez
`dispose()`** quand vous détachez la vue :

```ts
grid.view.dispose();   // libère boucle d'animation, contexte WebGL, listeners
```

## Je n'ai aucun rendu 3D

Le cœur est **headless par défaut**. Injectez une fabrique de vue **avant** de construire des grilles, côté
navigateur :

```ts
import { XNeuroneVisualizerForGrid } from '@damba/libxn-visualization';
XNeuroneGrid.viewFactory = (door) => new XNeuroneVisualizerForGrid(door);
```

## `allFacts()` est lent sur un gros corpus

`allFacts()` est en O(F) : il énumère **tout** (statut, sources, drapeaux par fait). Ne l'appelez **qu'une
fois** par requête, jamais dans une boucle. Pour ne lire que des triplets, préférez des requêtes ciblées
(`ask`, `askInverse`, `matchFacts`) qui sont indexées. Voir [Performance](/performance).

## Un LLM choisit mal parmi mes tools

Ne donnez pas les 230 tools d'un coup : sélectionnez les pertinents avec la récupération avant de les
envoyer au modèle. Voir [Catalogue de tools](/tool-catalog).

```ts
const tools = toAnthropicTools(registry.search(userMessage, 16));
```

## Un tool renvoie « ctx.X requis »

Certains tools ont besoin d'un sous-système **stateful** dans le contexte (`rules`, `entityMemory`,
`generator`, `contextualizer`, `grid`). Fournissez-le à l'appel :

```ts
const ctx = { kb, rules: new RuleEngine(kb) };
```

## Une règle « tout humain est mortel » n'est pas ajoutée

`addRuleFromText` attend le **DSL** (`X est humain => X est mortel`), pas du langage naturel. Pour le NL,
passez d'abord par `NaturalRuleParser.parse(text)` puis ajoutez le `dsl` obtenu. Voir [Règles](/rules).
