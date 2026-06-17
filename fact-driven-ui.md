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
| Listes | `for_each "cart item"` + gabarit (`$item` = la valeur) |
| Conditionnel / RBAC | `show_if "s p o"` (lecture KB, 0 token) |
| Navigation | tool `navigate` → route + `show_if` pour basculer les panneaux |
| Données distantes | tool `http` (port injecté, donc mockable) → écrit le résultat en faits |
| Variantes **dev/prod** | KB injectable : une `LayeredKnowledgeBase` superpose un overlay (le plus spécifique gagne) |
| Hot-swap | `app.kb.tell(...)` / `retract(...)` puis re-render |

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

## Limites assumées

- L'UI **ne remplace pas React** : elle s'appuie dessus pour le rendu/la réconciliation (clés
  stables = id du nœud). Elle **n'invente pas de composants** — l'app fournit sa bibliothèque via le
  *registry* ; les faits ne font que les **assembler et les piloter**.
- Les effets (`http`) sont des **ports injectés** (effet à la frontière) ; le flot reste déterministe.
