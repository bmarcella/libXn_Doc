# UI pilotée par faits

La thèse « **le comportement de l'application est des faits gouvernés** » s'étend au **frontend** :
l'écran (structure) ET son comportement vivent dans des faits ; **React n'est qu'un moteur de
rendu**. Ajouter ou retirer un fait change l'écran **à chaud, sans redéployer** — de façon
**déterministe, traçable et gouvernée**. C'est du *Server-Driven UI*, mais avec QPath comme source.

> Paquet `@damba/libxn-react-ui` (binding React optionnel, hors du noyau). Le cœur reste agnostique :
> il produit un arbre de données (`renderTree`) ; React le consomme.

## En 12 lignes

```tsx
import { createFactApp, FactUI } from '@damba/libxn-react-ui';

const app = createFactApp();
app.components({ Card, Text, Button });                 // TES composants React
await app.state({ counter: { value: 0 } });             // état initial
await app.screen('counter', {                            // l'écran EN OBJET (→ faits)
  component: 'Card',
  children: [
    { component: 'Text',   bind: { text: 'counter value' } },
    { component: 'Button', props: { label: '+1' }, on: { click: 'inc' } },
  ],
});
await app.flow('inc', [{ do: 'increment', path: 'counter value' }]); // le comportement EN faits

export const App = () => <FactUI app={app} screen="counter" />;
```

Pas de `ToolRegistry`, pas de `FlowRunner`, pas de store à câbler : la **façade** `createFactApp`
les cache. Le dev écrit des écrans en **objets** (sucre), qui deviennent des faits sous le capot.

## Ce que fait l'UI

1. **Elle se dessine à partir de faits** — `(node, component, "Button")`, `(btn, prop.label, "+1")`,
   `(box, child, btn)`… ; React rend l'arbre produit par `renderTree`.
2. **Elle réagit via des flux** — `(btn, on_click, "inc")` exécute le flux `inc` (FlowRunner) ; ses
   actions mutent l'**état** (aussi des faits) → re-render. Boucle **déterministe**.
3. **Elle se modifie à chaud** — ajouter un fait = ajouter un bouton ; en retirer un = le faire
   disparaître. Sans rebuild.
4. **Elle est gouvernée** — `show_if "alice can delete"` masque le bouton tant que la permission
   n'existe pas (RBAC) ; provenance/historique tracent qui a changé l'écran et quand.

## Capacités

| Capacité | Comment |
|---|---|
| Rendu depuis les faits | `renderTree` (pur, déterministe, borné) + un *registry* de composants |
| État réactif | mutations via tools (`set`/`increment`/`toggle`) → re-render |
| Événements | `on_click`/`on_change` → flux FlowRunner |
| Formulaires | `on_change` transmet la saisie → `$event` dans le flux (`set value $event`) |
| Listes | `for_each "cart item"` + gabarit ; `$item` = la valeur, **disponible aussi dans les events de la ligne** (sélection/suppression par item) |
| Conditionnel / RBAC | `show_if "s p o"` (lecture KB, 0 token) |
| Navigation | tool `navigate` → route + `show_if` pour basculer les panneaux |
| Données distantes | tool `http` (port injecté, donc mockable) → écrit le résultat en faits |
| Variantes **dev/prod** | KB injectable : une `LayeredKnowledgeBase` superpose un overlay (le plus spécifique gagne) |
| Hot-swap | `app.kb.tell(...)` / `retract(...)` puis re-render |
| Montage (chargement initial) | `(screen, on_mount, flow)` → flux exécuté au montage (ex. charger des données) |

## « Prompt → écran », en sûreté

Un LLM peut **proposer** un écran à partir d'une demande en langage naturel — mais il est **auteur,
jamais exécuteur**. `proposeScreen` parse sa réponse en faits, puis **filtre** : seuls les prédicats
du vocabulaire UI/flux et les **composants autorisés** sont retenus ; le reste part dans `rejected`
(anti-injection). Le rendu, lui, reste **déterministe**.

```ts
const proposal = await proposeScreen(llm, 'un écran de connexion : email, mot de passe, bouton',
  { allowedComponents: ['Card', 'Input', 'Button'] });
if (isRenderable(proposal)) { await app.facts(proposal.facts); } // proposal.rejected = écarté
```

### Listes interactives (`$item` dans les events)

Dans un `for_each`, l'event d'une **ligne** connaît **son** item via `$item` — donc sélectionner,
supprimer ou éditer une ligne précise se fait sans gymnastique :

```ts
await app.screen('panier', {
  component: 'List', forEach: 'cart item',
  template: { component: 'Row', props: { label: '$item' }, on: { click: 'pick' } },
});
await app.flow('pick', [{ do: 'set', path: 'cart selected', value: '$item' }]); // → clic sur 'b' : selected = 'b'
// suppression par item : { do: 'set', path: '$item removed', value: 'true' } + show_if « cart selected … »
```

## Mise en forme (CSS)

Les props sont passées **telles quelles** au composant. Styliser = passer une prop que ton
composant applique — le plus simple étant `className` (classes utilitaires / ta CSS) :

```ts
// fait
{ component: 'Button', props: { label: 'Enregistrer', className: 'btn btn-primary' } }
```
```tsx
// ton composant (il possède la CSS)
const Button = (p: any) => (
  <button className={p.className} onClick={p.onClick}>{p.label}</button>
);
```

Les valeurs de faits sont des **chaînes** → `className` est idéal. Pour un `style` en ligne (React
attend un objet), passe une chaîne et laisse le composant la parser, ou expose des props dédiées :

```tsx
const styleObj = (s = '') => Object.fromEntries(
  s.split(';').filter(Boolean).map(r => { const [k, v] = r.split(':'); return [k.trim(), v.trim()]; }),
);
const Box = (p: any) => <div style={styleObj(p.style)}>{p.children}</div>;
// fait : { component:'Box', props:{ style:'padding:8px; background:#eee' }, children:[…] }
```

## Appels serveur — HTTP & WebSocket

**HTTP** : injecte un port `http` (un wrapper `fetch`), puis un **flux** charge la donnée → l'écrit
en **faits** → l'écran la rend (`bind`/`for_each`). Effet à la frontière, flot déterministe.

```ts
const app = createFactApp({
  http: (url, init) => fetch(url, init).then(r => r.json()),   // port réel (mockable en test)
});
app.components({ List, Item, Button });

await app.screen('shop', {
  component: 'Card',
  children: [
    { component: 'Button', props: { label: 'Charger' }, on: { click: 'load' } },
    { component: 'List', forEach: 'cart item', template: { component: 'Item', props: { text: '$item' } } },
  ],
});
await app.flow('load', [{ do: 'http', url: '/api/items', list: 'cart item' }]);            // GET → liste
await app.flow('save', [{ do: 'http', method: 'POST', url: '/api/cart', body: '$event' }]); // POST (body)
```

Pour **charger au montage** (sans bouton), déclare le flux en `onMount` de l'écran — c'est un fait
`(screen, on_mount, flow)` que `<FactUI>` exécute une fois au montage :

```ts
await app.screen('shop', {
  component: 'List', forEach: 'cart item',
  template: { component: 'Item', props: { text: '$item' } },
  onMount: 'load',            // ← chargement initial, piloté par fait
});
```

**WebSocket** : ouvre le socket **à part** ; chaque message écrit des faits + notifie → re-render
(le store et la KB sont exposés, aucune API supplémentaire) :

```ts
const ws = new WebSocket('wss://example/feed');
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  void app.store.replaceList('feed item', data.items); // écrit les faits + notifie
};
// un écran `for_each 'feed item'` affiche le flux EN DIRECT, sans state séparé.
```

**Utiliser les données** : tout ce qui est écrit en faits (par `http`, le socket, ou `app.kb.tell`)
est immédiatement disponible aux `bind`/`for_each`/`show_if` — il n'y a **pas** d'état séparé à
synchroniser : la KB *est* l'état.

## Intégrations (axios, socket.io, gRPC, Tailwind, MUI…)

Le paquet ne dépend que de `react`. Les libs externes se branchent à **trois coutures**, sans
toucher au cœur : le **port `http`**, des **actions custom** (`app.action`, avec accès à `app.kb` /
`app.store`), et le **registry de composants**.

**axios** → le port `http` :
```ts
import axios from 'axios';
const app = createFactApp({
  http: (url, init) => axios.request({ url, method: init?.method ?? 'GET', data: init?.body }).then(r => r.data),
});
// tes intercepteurs/auth/retry s'appliquent ; les flux `http` marchent inchangés
```

**Tailwind** (et CSS modules / styled) → `prop.className` (zéro intégration, compilé au build) :
```ts
{ component: 'Button', props: { label: 'Save', className: 'px-4 py-2 rounded bg-blue-600 text-white' } }
```

**socket.io / SSE / WebSocket** → chaque message écrit des faits ; pour émettre, une action :
```ts
import { io } from 'socket.io-client';
const socket = io('https://api.example.com');
socket.on('feed', (items: string[]) => { void app.store.replaceList('feed item', items); });
app.action('emit', async (i) => { socket.emit(String(i.event), i.payload); });
```

**gRPC / SDK quelconque** → une action custom (l'appel n'est pas « fetch-shaped ») :
```ts
const app = createFactApp();
app.action('loadCart', async () => {
  const res = await grpcClient.list(new ListReq());
  await app.store.replaceList('cart item', res.getItemsList());
});
await app.flow('load', [{ do: 'loadCart' }]);   // + onMount:'load' pour charger au montage
```

**Bibliothèques de composants (MUI / shadcn / Radix)** → le registry :
```tsx
import { Button, Card } from '@mui/material';
app.components({ Button, Card });   // faits : prop.variant 'contained' → prop MUI
```

> **Props objet.** Les valeurs de faits sont des **chaînes** ; une prop **objet/tableau** (ex. `sx`
> MUI, `columns` d'une table) ne se passe pas directement. Enregistre un **composant adaptateur** qui
> convertit des props-chaînes en props-objet :
> ```tsx
> const DataTable = (p: any) => <MuiTable columns={JSON.parse(p.columns ?? '[]')} dense={p.dense === 'true'} />;
> app.components({ DataTable });   // fait : prop.columns '[{"key":"name"}]'
> ```

Ces libs sont **tes** dépendances dans **ton** app — pas dans le paquet (qui reste sans dépendance).

## Limites assumées

- L'UI **ne remplace pas React** : elle s'appuie dessus pour le rendu/la réconciliation (clés
  stables = id du nœud). Elle **n'invente pas de composants** — l'app fournit sa bibliothèque via le
  *registry* ; les faits ne font que les **assembler et les piloter**.
- Les effets (`http`) sont des **ports injectés** (effet à la frontière) ; le flot reste déterministe.
