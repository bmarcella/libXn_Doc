# UI pilotée par faits

La thèse « **le comportement de l'application est des faits gouvernés** » s'étend au **frontend** :
l'écran (structure) ET son comportement vivent dans des faits ; **le framework n'est qu'un moteur
de rendu**. Ajouter ou retirer un fait change l'écran **à chaud, sans redéployer** — de façon
**déterministe, traçable et gouvernée**. C'est du *Server-Driven UI*, mais avec QPath comme source.

> **Deux bindings, un cœur partagé.** Le cœur `@damba/libxn-ui-core` est **agnostique au framework** :
> à partir des faits, il produit un arbre de données (`renderTree`), gère l'état (store) et le
> comportement (flux). Deux paquets optionnels le rendent : `@damba/libxn-react-ui` (React) et
> `@damba/libxn-angular-ui` (Angular). L'API est **identique** (`createFactApp`, écrans/flux/état en
> faits) ; seuls le composant de rendu et le *registry* de composants diffèrent. Les exemples ci-dessous
> sont en React ; l'équivalent Angular suit juste après.

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

> **Le même écran en Angular** (`@damba/libxn-angular-ui`) — API identique, composants Angular,
> rendu par `<fact-ui>` :
>
> ```ts
> import { Component } from '@angular/core';
> import { createFactApp, FactUiComponent } from '@damba/libxn-angular-ui';
>
> @Component({
>   selector: 'app-counter', standalone: true, imports: [FactUiComponent],
>   template: `<fact-ui [app]="app" screen="counter"></fact-ui>`,
> })
> export class CounterComponent {
>   app = createFactApp().components({ Card, Text, Button }); // TES composants Angular
>   async ngOnInit() {
>     await this.app.state({ counter: { value: 0 } });
>     await this.app.flow('inc', [{ do: 'increment', path: 'counter value' }]);
>     await this.app.screen('counter', { component: 'Card', children: [
>       { component: 'Text',   bind: { text: 'counter value' } },
>       { component: 'Button', props: { label: '+1' }, on: { click: 'inc' } },
>     ] });
>   }
> }
> ```
>
> Contrat des composants Angular : props → `@Input()`, events → `@Output()` de même nom
> (`on_click` → `@Output() click`), enfants → `<ng-content>`. Le rendu réconcilie par identité de
> nœud : les `@Input` changent **en place**, le focus d'un champ saisi est préservé.

**Les appels de cet exemple, argument par argument :**

`createFactApp(options?)` — fabrique l'app. L'objet d'options est **entièrement optionnel** :

| Argument | Rôle | Défaut |
|---|---|---|
| `options.kb?` | la `KnowledgeBase` à utiliser — passe une `LayeredKnowledgeBase` pour des variantes dev/prod ou par utilisateur | une KB neuve sur une grille **headless** (`new XNeuroneGrid(undefined, { headless: true })`) |
| `options.http?` | le **port HTTP** (`(url, init?) => Promise<unknown>`) qui active le tool `http` ; sans lui, le tool `http` n'est **pas** enregistré | — (aucun ; pas d'appels réseau) |

`app.components(map)` — un seul argument, `map`, un objet `{ nom de fait → composant React }` (ex. `{ Card, Text, Button }`) : la clé est le nom utilisé dans les faits `component`, la valeur le composant qui le rend. **Synchrone et chaînable** (retourne `app`).

`app.state(initial)` — un seul argument : l'état initial sous forme `{ sujet: { prédicat: valeur } }`. La valeur peut être `string | number | boolean` (stockée en chaîne) **ou un tableau** (`string[]`/`number[]`) qui amorce une **liste** multi-valuée. `await` car il écrit dans la KB.

`app.screen(name, spec)` :

- **`name`** — le nom de l'écran (le sujet racine des faits, ex. `'counter'`) ; c'est ce que tu passes à `<FactUI screen="…">`.
- **`spec`** — le `ScreenSpec` (objet déclaratif converti en faits). Champs détaillés au tableau ci-dessous.

`app.flow(name, steps)` :

- **`name`** — le nom du flux (invoqué par les events `on: { click: 'inc' }` et exécuté par `FlowRunner`).
- **`steps`** — un **tableau d'actions** `ActionSpec`, exécutées **séquentiellement**. Chaque action est `{ do: '<tool>', ...args }` : `do` est le nom du tool, les autres clés deviennent des `arg.<k>` (voir « Actions de flux » plus bas).

`<FactUI app screen>` — le composant qui rend l'écran. **`app`** = l'instance `createFactApp` ; **`screen`** = le nom d'écran à rendre (chaîne). Il s'abonne au store et re-rend à chaque mutation.

> 💡 `components`, `action`, `onDispose` sont **synchrones et chaînables** (retournent `app`) ; `screen`, `flow`, `facts`, `state` sont **asynchrones** (ils écrivent dans la KB) — `await`-les avant le premier rendu.

**Le `ScreenSpec` (l'objet passé à `app.screen` / `template`)** — tous les champs sont optionnels sauf `component` :

| Champ | Rôle | Défaut |
|---|---|---|
| `component` | **(requis)** nom du composant à rendre (clé du registry) → fait `(node, component, …)` | — |
| `props?` | props **statiques** (`string \| number \| boolean`, stockées en chaîne) → `prop.<k>` | `{}` |
| `bind?` | props **liées à l'état** ; valeur = expression « s p » → `bind.<k>` | `{}` |
| `on?` | events → flux ; clé = event (`click`, `change`), valeur = nom de flux → `on_<event>` | `{}` |
| `showIf?` | rendu conditionnel du **nœud** (« s p o », comparateur, ou `not …`) → `show_if` | — (toujours rendu) |
| `forEach?` | liste : expression « s p » dont chaque valeur produit une ligne (avec `template`) | — |
| `template?` | gabarit `ScreenSpec` rendu par item (`$item` = la valeur) ; requiert `forEach` | — |
| `itemKey?` | clé React stable par identité (ex. `'$item'`) ; n'a de sens qu'avec `forEach` | id positionnel |
| `children?` | enfants `ScreenSpec[]` ordonnés (exclusif avec `forEach`/`template`) | `[]` |
| `onMount?` | **racine seule** : flux (ou liste de flux) exécuté(s) au montage → `on_mount` | — |
| `guard?` | **racine seule** : condition d'accès page (même grammaire que `showIf`) → `guard` | — (pas de garde) |
| `denied?` | **racine seule** : écran de repli si `guard` échoue ; sans lui, rien n'est rendu → `denied` | — (rend `null`) |

> ⚠️ `forEach`+`template` et `children` s'**excluent** : une liste n'a pas d'enfants statiques (le gabarit est sa seule descendance). `onMount`/`guard`/`denied` ne sont lus **qu'à la racine** de l'écran (ignorés sur un nœud enfant).

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
| Listes | `for_each "cart item"` + gabarit ; `$item` dans events ; `itemKey: '$item'` → clé React par **identité** (pas de remount au réordonnancement) |
| Conditionnel / RBAC (nœud) | `show_if` : `s p o` (existence), `s p OP v` (`>= <= != > < =`), `not <cond>` — lecture KB, 0 token |
| Sécurité de page (RBAC) | `guard` (même grammaire que `show_if`) gate l'écran entier ; `denied` → écran de repli (login/403) |
| Navigation | tools `navigate` / `back` (historique) + `<FactRouter app initial>` (rend l'écran de `route current`) ; ou `show_if` pour basculer des panneaux |
| Données distantes | tool `http` (port injecté, donc mockable) → écrit le résultat en faits |
| Chargement & erreurs | `http` écrit `(cible, loading, true/false)` + `(cible, error, msg)` ; une erreur n'interrompt pas le flux → `show_if "x loading = true"` / `show_if "x error"` |
| CRUD de liste | tools `append` / `remove` (`$event`/`$item`) → ajouter/retirer un item ; `set`/`toggle`/`increment` pour le scalaire |
| Variantes **dev/prod** | KB injectable : une `LayeredKnowledgeBase` superpose un overlay (le plus spécifique gagne) |
| Hot-swap | `app.kb.tell(...)` / `retract(...)` puis re-render |
| Montage (chargement initial) | `(screen, on_mount, flow)` → flux exécuté au montage (ex. charger des données) |

## React classique ou UI pilotée par faits ?

Les deux approches sont **complémentaires** — ce n'est pas un remplacement de React (qui reste le
moteur de rendu). Le choix dépend de **qui** change l'écran, **quand**, et **sous quelle
gouvernance**.

| Critère | React « normal » | UI pilotée par faits (`@damba/libxn-react-ui`) |
|---|---|---|
| Changer l'écran / le comportement | recompiler + redéployer | **à chaud** : ajouter/retirer un fait, **0 build** |
| Gouvernance | rien nativement | **provenance + historique** (qui a changé quoi, quand), RBAC **nœud** + **page** |
| Variantes (tenant, rôle, A/B, dev/prod) | branches de code / *flags* | **overlays** `LayeredKnowledgeBase` (le plus spécifique gagne) |
| UI générée par un LLM | code arbitraire (risqué) | LLM **auteur** filtré + validé, **rendu déterministe** |
| Source de vérité | état + props éparpillés | **la KB** (structure, état, comportement = faits) |
| Sûreté de typage | bout en bout (TS) | props en **chaînes** (coercition / adaptateur) |
| Props riches (objets, callbacks) | natif | chaînes ; objets via **composant adaptateur** |
| Performance | fine, optimisée à la main | re-render à la **granularité de l'action** (mémo par nœud non implémentée) |
| Courbe d'apprentissage | standard React | + un **vocabulaire de faits/flux** à connaître |
| Écosystème / recrutement | énorme | ta bibliothèque React via le *registry* |

**Quand coder en React classique.** UI **sur-mesure** et très interactive (canvas, animations, gestes),
besoin de **sûreté de typage** maximale et de props riches, performance fine sur de gros arbres, ou
simplement une équipe qui veut rester sur les outils standards. La structure est figée au build —
c'est un avantage quand elle n'a **pas** vocation à changer sans déploiement.

**Quand utiliser l'UI pilotée par faits.** Écrans qui doivent **changer sans redéployer**, être
**gouvernés/audités** (qui a modifié l'écran, quand), **varier par tenant/rôle/édition** (dev↔prod),
ou être **générés par un prompt** en sûreté : formulaires, **CRUD**, panneaux d'admin, **tableaux de
bord**, parcours d'onboarding, écrans pilotés par configuration ou *feature flags*.

**Approche hybride (recommandée).** On mélange : les composants **sur-mesure** (widget de graphe,
éditeur riche) restent du React classique, **enregistrés dans le *registry*** ; les faits ne font que
les **assembler et les piloter**. On garde la gouvernance/hot-swap là où elle apporte de la valeur,
sans payer la rigidité des chaînes là où le sur-mesure s'impose.

## « Prompt → écran », en sûreté

Un LLM peut **proposer** un écran à partir d'une demande en langage naturel — mais il est **auteur,
jamais exécuteur**. `proposeScreen` parse sa réponse en faits, puis **filtre** : seuls les prédicats
du vocabulaire UI/flux, les **composants autorisés** (`allowedComponents`) et les **actions
autorisées** (`allowedActions`) sont retenus ; le reste part dans `rejected` (anti-injection). Le
rendu, lui, reste **déterministe**.

```ts
const proposal = await proposeScreen(llm, 'un écran de connexion : email, mot de passe, bouton', {
  allowedComponents: ['Card', 'Input', 'Button'],
  allowedActions: ['set', 'toggle', 'navigate'],   // ⇐ ce qu'un flux proposé a le droit d'invoquer
});
if (isRenderable(proposal)) {
  await app.facts(proposal.facts);                  // proposal.rejected = écarté
  const check = app.checkFlows({ allowedTools: ['set', 'toggle', 'navigate'] }); // gate avant rendu
  if (!check.ok) { /* … boucle non bornée, lien mort, outil interdit → ne pas rendre … */ }
}
```

`allowedActions` ferme la faille évidente : sans elle, le LLM pourrait câbler `action http` +
`arg.url <exfiltration>`, un `navigate` ou un `set` arbitraire. `app.checkFlows()` lance ensuite
`FlowValidator` sur **chaque** flux de la KB (boucle non bornée, lien mort, condition incomplète,
outil hors liste) — le **gate dev→prod**, avant tout rendu.

**Les arguments en détail :**

`proposeScreen(llm, demand, opts?)` :

- **`llm`** — un `LlmPort` (`{ complete(prompt, opts?) => Promise<string> }`, mockable en test). Le LLM est **auteur**, jamais exécuteur.
- **`demand`** — la demande en langage naturel (ex. `'un écran de connexion : email, mot de passe, bouton'`).
- **`opts?`** — options de filtrage (toutes optionnelles) :

| Argument | Rôle | Défaut |
|---|---|---|
| `opts.allowedComponents?` | liste blanche des composants invocables ; un `component` hors liste part dans `rejected` | — (tout composant accepté) |
| `opts.allowedActions?` | liste blanche des **actions** (objet d'un prédicat `action`) qu'un flux proposé peut invoquer ; recommandé en contexte non fiable | — (toute action acceptée) |
| `opts.systemPrompt?` | system prompt envoyé au LLM | `SCREEN_AUTHORING_RULES` (les règles du format de faits, exportées) |

La valeur de retour est une **`ScreenProposal`** : `{ facts, rejected, screen?, raw }` — `facts` = triplets **retenus** (à écrire via `app.facts`), `rejected` = triplets **écartés** (anti-injection), `screen` = le nom d'écran déduit du fait `render` (ou `undefined`), `raw` = la réponse brute du LLM (audit).

`isRenderable(proposal)` — un seul argument, la `ScreenProposal` ; renvoie `true` si elle contient une racine d'écran (`proposal.screen !== undefined`). Gate minimal avant écriture.

`app.facts(triples)` — un seul argument : un tableau de triplets `[s, p, o]` (typiquement `proposal.facts`), écrits **casse préservée**. `await` (écrit dans la KB).

`app.checkFlows(opts?)` — valide **tous** les flux présents dans la KB. Unique option :

- **`opts.allowedTools?`** — liste blanche d'outils ; tout flux invoquant un outil hors liste est marqué invalide. Omise → seules les vérifications structurelles (boucle non bornée, lien mort, condition incomplète) s'appliquent.

Retour : `{ ok: boolean, flows: Array<{ flow, result }> }` — `ok` est `true` si **tous** les flux sont valides ; `flows` détaille chaque flux et son `FlowValidationResult`.

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

**Identité d'item.** `itemKey: '$item'` clé par la **valeur**. ⚠️ Le KB **déduplique** les triplets
identiques : deux items de **même valeur** (« Lait », « Lait ») se **collapsent** en un seul — on ne
peut donc pas avoir deux lignes « Lait » comme valeurs nues. Pour des doublons logiques (et une
identité robuste : suppression un à un, propriétés par ligne), modélise chaque item en **entité** :
la liste porte des **ids** distincts et le gabarit binde leurs propriétés. (Un `itemKey` qui
collisionne — p. ex. constant — reste sans danger : un suffixe d'occurrence garantit des clés React
uniques.)

```ts
// la liste = des ids ; chaque id a ses faits → $item résout l'id, on binde ses propriétés
await app.kb.tell('tasks', 'item', 't1'); await app.kb.tell('t1', 'label', 'Lait');
await app.kb.tell('tasks', 'item', 't2'); await app.kb.tell('t2', 'label', 'Lait'); // même libellé, id distinct
// gabarit : { component:'Row', bind:{ text:'$item label' }, on:{ click:'toggle' } } + itemKey:'$item'
await app.flow('toggle', [{ do: 'toggle', path: '$item done' }]);   // bascule CETTE ligne (par id)
await app.flow('del', [{ do: 'remove', path: 'tasks item' }]);      // retire l'id (value défaut = $item)
```

**Les `arg.*` de ces actions (objet `ActionSpec` = `{ do: '<tool>', ...args }`) :**

| Tool (`do`) | Arguments | Effet |
|---|---|---|
| `set` | `path` (« s p »), `value` | écrit l'**unique** valeur de l'état (remplace l'ancienne) |
| `toggle` | `path` (« s p ») | bascule un booléen `'true'`/`'false'` |
| `increment` | `path` (« s p »), `by?` (défaut **1**) | additionne `by` à un état numérique |
| `append` | `path` (« s p »), `value` | ajoute une valeur à une **liste** (sans retirer les autres) |
| `remove` | `path` (« s p »), `value?` (**défaut = `$item`** de la ligne) | retire une valeur de la liste |

`$event` (valeur saisie) et `$item` (item de la ligne `for_each` cliquée) sont **substitués automatiquement** dans les `arg.*` par le `FlowRunner` au moment de l'exécution. `app.kb.tell(s, p, o)` écrit un triplet brut (les trois positions du fait) ; ici il sème la liste d'ids et leurs propriétés.

## Sécurité de page (RBAC)

`show_if` protège un **nœud** (un bouton). Pour protéger une **page entière**, l'écran porte un
`guard` : une condition (même grammaire que `show_if`) qui doit passer pour que l'écran se rende. Si
elle échoue, `denied` désigne l'écran de **repli** (connexion, 403) ; sans `denied`, rien n'est
rendu. L'autorisation **vit dans la KB** — pas dans le code :

```ts
await app.screen('admin', {
  component: 'Card',
  guard: 'session role admin',   // condition d'accès (lecture KB, 0 token)
  denied: 'login',               // sinon → écran de repli (sans denied : rien)
  children: [ /* … panneau admin … */ ],
});
await app.screen('login', { component: 'Card', children: [{ component: 'Text', props: { text: 'Connexion' } }] });
```

```ts
// Octroyer l'accès = écrire un fait (tracé par provenance : qui, quand) ; révoquer = le retirer.
await app.kb.tell('session', 'role', 'admin');  app.store.touch();   // → la page admin s'affiche
await app.kb.retract('session', 'role', 'admin'); app.store.touch(); // → reverrouillée à chaud (repli)
```

**Les appels de bas niveau utilisés ici :**

- `app.kb.tell(s, p, o)` — écrit le fait `(sujet, prédicat, objet)` ; `await` (asynchrone, tracé par provenance). Une 4ᵉ option `source` existe (qui/d'où vient le fait) mais n'est pas requise.
- `app.kb.retract(s, p, o, reason?)` — rétracte le fait `(s, p, o)` ; `reason?` est une étiquette d'audit optionnelle. Renvoie `true` si un fait a été rétracté. **Synchrone** (pas d'`await`).
- `app.store.touch()` — **sans argument** : incrémente la version du store et notifie React → re-render. À appeler **après** un `tell`/`retract` manuel (hot-swap), car ces écritures court-circuitent les tools qui notifient d'eux-mêmes.

> 💡 `app.kb.ask(s, p)` (utilisé par les gardes/`show_if` en coulisses) prend le **sujet** et le **prédicat** et renvoie le **tableau** des objets connus (`[]` si aucun) — lecture KB pure, 0 token.

Conséquences : l'accès est **gouverné et auditable** (provenance/historique tracent chaque
octroi/révocation), **hot-swap** (changer un droit ne redéploie rien), et **déterministe** (le gate
est une lecture KB pure, jamais un effet). Les redirections `denied` en boucle sont bornées
(repli → `null`), donc l'arrêt est garanti. La condition accepte les comparateurs et `not`
(ex. `guard: 'not session banned true'`, `guard: 'session level >= 3'`).

> Sécurité : `guard` cache l'écran côté client — c'est de la **gouvernance d'UI**, pas un contrôle
> d'accès serveur. Les données sensibles restent protégées par le backend (le port `http` ne renvoie
> que ce que l'utilisateur a le droit de voir).

## Navigation multi-écrans (`FactRouter`)

Pour une vraie navigation entre écrans (plutôt que des panneaux `show_if`), `<FactRouter>` rend
l'écran nommé par `route current` ; les tools `navigate` (avance, empile l'historique) et `back`
(revient) pilotent la route — toujours en faits.

```ts
await app.flow('toAbout', [{ do: 'navigate', to: 'about' }]);
await app.flow('goBack',  [{ do: 'back' }]);            // dépile l'historique
// chaque écran est défini par app.screen('home'|'about', …)
export const App = () => <FactRouter app={app} initial="home" />;
```

`FactRouter` pose la route initiale comme fait au montage, puis re-rend à chaque `navigate`/`back`.
L'historique est conservé en fait (`route stack`) → le `back` est gouverné et traçable comme le reste.

**Les arguments de ce bloc :**

- Action `navigate` — un seul `arg.to` : la route cible. Empile la route courante dans l'historique (`route stack`) puis écrit `(route, current, <to>)`.
- Action `back` — **aucun argument** : dépile l'historique et restaure la route précédente. Sans effet si l'historique est vide.
- `<FactRouter app initial?>` — **`app`** = l'instance ; **`initial?`** = l'écran affiché tant qu'aucune route n'est posée (optionnel : sans lui, rien n'est rendu jusqu'au premier `navigate`).

**Cycle de vie.** Pour libérer une app (fermer un socket ouvert hors modèle, détacher les abonnés du
store) : `app.onDispose(() => socket.close())` puis `app.dispose()`.

- `app.onDispose(fn)` — un seul argument, la fonction de nettoyage (sans argument, sans retour) exécutée par `dispose()`. Chaînable.
- `app.dispose()` — **sans argument** : exécute les nettoyages enregistrés puis détache les abonnés du store. **Idempotent** (rappelable sans risque).

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

**Le port `http` et l'action `http` :**

`createFactApp({ http })` — le **port** est `(url, init?) => Promise<unknown>` : `url` est l'adresse, `init?` un objet `{ method?, body? }`, et la valeur **résolue** est le corps **déjà parsé** (d'où le `.then(r => r.json())`). C'est le seul effet de bord ; il est injecté donc mockable en test.

L'action de flux `http` accepte ces `arg.*` :

| Argument | Rôle | Défaut |
|---|---|---|
| `url` | l'URL à appeler (`$event` supporté) | — (requis) |
| `method?` | verbe HTTP | `'GET'` |
| `body?` | corps de la requête (ex. `'$event'`) | — (aucun corps) |
| `list?` | cible « s p » où écrire un **tableau** de résultats (via `replaceList`) | — |
| `set?` | cible « s p » où écrire un **scalaire** | — |
| `status?` | sujet explicite pour l'état `loading`/`error` | le **sujet** (1er mot) de `list`/`set` |

Effet annexe : l'action écrit `(<status>, loading, true/false)` autour de l'appel et `(<status>, error, msg)` en cas d'échec — **une erreur n'interrompt jamais le flux** (consignée, pas relancée).

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

`app.store.replaceList(path, values)` — **`path`** = la liste cible « s p » (ex. `'feed item'`) ; **`values`** = le **tableau** de chaînes qui remplace **intégralement** la liste (les anciennes valeurs sont rétractées). Écrit les faits **puis notifie** (re-render) — d'où l'absence d'état React séparé. `await` (asynchrone). Le store expose aussi `set` / `append` / `removeItem` / `increment` / `toggle` selon la même convention « s p ».

**Utiliser les données** : tout ce qui est écrit en faits (par `http`, le socket, ou `app.kb.tell`)
est immédiatement disponible aux `bind`/`for_each`/`show_if` — il n'y a **pas** d'état séparé à
synchroniser : la KB *est* l'état.

**Chargement & erreurs (en faits).** Le tool `http` écrit l'état de la requête : `(cible, loading,
true)` au départ, `(cible, loading, false)` à la fin, et `(cible, error, message)` en cas d'échec.
La `cible` est le sujet de `list`/`set` (ex. `cart`), ou un `arg.status` explicite. **Une erreur
n'interrompt jamais le flux** (elle est consignée, pas relancée) — fini les rejets non gérés. On
affiche spinner et message par de simples `show_if` :

```ts
await app.flow('load', [{ do: 'http', url: '/api/cart', list: 'cart item' }]);
await app.screen('shop', {
  component: 'Card', onMount: 'load',
  children: [
    { component: 'Spinner', showIf: 'cart loading = true' },        // pendant la requête
    { component: 'Text', bind: { text: 'cart error' }, showIf: 'cart error' }, // si échec (existence : « s p »)
    { component: 'List', forEach: 'cart item', template: { component: 'Item', props: { text: '$item' } } },
  ],
});
```

> `show_if "cart error"` (deux mots) teste l'**existence** d'une valeur ; `show_if "cart loading =
> true"` compare. Les deux sont des lectures KB à 0 token.

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

`app.action(name, fn)` — enregistre un **tool custom** invocable comme `{ do: '<name>', … }` dans un flux :

- **`name`** — le nom du tool (l'objet d'un prédicat `action`).
- **`fn`** — la fonction exécutée : reçoit `input` (un `Record<string, unknown>` = les `arg.*` du step, `$event`/`$item` déjà résolus), peut être `async`, retour ignoré. À l'intérieur, `app.kb` et `app.store` sont accessibles pour lire/muter des faits.

Chaînable (retourne `app`). Ici `i.event` / `i.payload` sont les `arg.event` / `arg.payload` du step.

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
