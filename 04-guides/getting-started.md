# Démarrer

## Installation

### Dans ce dépôt (actuel)

Le noyau vit dans `packages/libxn/` et est consommé via l'alias TypeScript `@damba/libxn` (déclaré dans
le `tsconfig.json` racine). Rien à installer — importe directement :

```ts
import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';
```

### En paquet npm (à venir)

Une fois publié :

```bash
npm install @damba/libxn
```

Le paquet n'a qu'une dépendance runtime : `rxjs`.

## Hello QPath

```ts
import { XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });

// Ingestion
await grid.processData('le chat dort');
await grid.processData('le chien court');

// Rappel approché
const r = grid.predict('le chat');
console.log(r.exact, r.values);

// Recherche plein-texte
console.log(grid.findValuesContaining('chat'));

// Persistance
const snap = grid.serialize();
const restored = XNeuroneGrid.fromSnapshot(snap);
```

> `headless: true` = pas de rendu. Pour visualiser, enregistre une fabrique de vue
> (`XNeuroneGrid.viewFactory`) — voir [architecture](architecture.md).

## Faits & raisonnement

```ts
import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('socrate', 'est', 'humain');
await kb.tell('humain', 'est', 'mortel');
await kb.tell('mortel', 'a', 'fin');

const chain = new ChainResolver(kb).chain('socrate', 'a');
console.log(ChainResolver.format(chain!));
```

## Tests

Le paquet utilise [vitest](https://vitest.dev) (runner Node, sans navigateur — preuve que le noyau
tourne hors Angular) :

```bash
cd packages/libxn
npm install
npm test
```

Plus d'exemples exécutables dans [`../examples/`](../examples/).

## Côté Node / backend (CommonJS)

Le paquet est **dual ESM + CJS** (build [tsup](https://tsup.egoist.dev) : `dist/index.js` ESM,
`dist/index.cjs` CJS, `dist/index.d.ts`). Il est donc consommable depuis un backend CommonJS
(ex. NestJS).

Dans ce dépôt, le backend `server/` le déclare en dépendance locale :

```jsonc
// server/package.json
"dependencies": { "@damba/libxn": "file:../packages/libxn" }
```

> ⚠️ Ordre de build : construire le paquet **avant** d'installer/builder le serveur, car la
> dépendance `file:` pointe vers `dist/` :
> ```bash
> cd packages/libxn && npm install && npm run build
> cd ../../server && npm install
> ```

Le noyau étant **isomorphe et sans dépendance**, le même code sert le front (via l'alias source) et
le back (via le paquet CJS). Exemple d'intégration NestJS : `server/src/qpath/qpath.service.ts`
(`QPathService` injectable qui enveloppe une `KnowledgeBase`). Smoke test : `node server/scripts/libxn-smoke.cjs`.
