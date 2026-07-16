# Fact-driven UI

The thesis "**an application's behavior is governed facts**" extends to the **frontend**: the screen
(structure) AND its behavior live in facts; **the framework is just a rendering engine**. Adding or
removing a fact changes the screen **at runtime, without redeploying** — **deterministically, traceably
and under governance**. It is Server-Driven UI, but with QPath as the source.

> **Two bindings, one shared core.** The core `@damba/libxn-ui-core` is **framework-agnostic**: from
> the facts it produces a data tree (`renderTree`), holds state (store) and behavior (flows). Two
> optional packages render it: `@damba/libxn-react-ui` (React) and `@damba/libxn-angular-ui` (Angular).
> The API is **identical** (`createFactApp`, screens/flows/state as facts); only the rendering component
> and the component *registry* differ. The examples below are in React; the Angular equivalent follows.

## In 12 lines

```tsx
import { createFactApp, FactUI } from '@damba/libxn-react-ui';

const app = createFactApp();
app.components({ Card, Text, Button });                 // YOUR React components
await app.state({ counter: { value: 0 } });             // initial state
await app.screen('counter', {                            // the screen AS AN OBJECT (→ facts)
  component: 'Card',
  children: [
    { component: 'Text',   bind: { text: 'counter value' } },
    { component: 'Button', props: { label: '+1' }, on: { click: 'inc' } },
  ],
});
await app.flow('inc', [{ do: 'increment', path: 'counter value' }]); // behavior AS facts

export const App = () => <FactUI app={app} screen="counter" />;
```

No `ToolRegistry`, no `FlowRunner`, no store to wire: the **facade** `createFactApp` hides them. You
write screens as **objects** (sugar) that become facts under the hood.

> **The same screen in Angular** (`@damba/libxn-angular-ui`) — identical API, Angular components,
> rendered by `<fact-ui>`:
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
>   app = createFactApp().components({ Card, Text, Button }); // YOUR Angular components
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
> Angular component contract: props → `@Input()`, events → `@Output()` of the same name
> (`on_click` → `@Output() click`), children → `<ng-content>`. Rendering reconciles by node identity:
> `@Input`s change **in place**, so the focus of a text field is preserved.

**The calls in this example, argument by argument:**

`createFactApp(options?)` — builds the app. The options object is **entirely optional**:

| Argument | Role | Default |
|---|---|---|
| `options.kb?` | the `KnowledgeBase` to use — pass a `LayeredKnowledgeBase` for dev/prod or per-user variants | a fresh KB on a **headless** grid (`new XNeuroneGrid(undefined, { headless: true })`) |
| `options.http?` | the **HTTP port** (`(url, init?) => Promise<unknown>`) that enables the `http` tool; without it the `http` tool is **not** registered | — (none; no network calls) |

`app.components(map)` — a single argument, `map`, an object `{ fact name → React component }` (e.g. `{ Card, Text, Button }`): the key is the name used in `component` facts, the value the component that renders it. **Synchronous and chainable** (returns `app`).

`app.state(initial)` — a single argument: the initial state as `{ subject: { predicate: value } }`. A value may be `string | number | boolean` (stored as a string) **or an array** (`string[]`/`number[]`) which seeds a multi-valued **list**. `await` it (it writes to the KB).

`app.screen(name, spec)`:

- **`name`** — the screen name (the root subject of the facts, e.g. `'counter'`); this is what you pass to `<FactUI screen="…">`.
- **`spec`** — the `ScreenSpec` (declarative object converted to facts). Fields detailed in the table below.

`app.flow(name, steps)`:

- **`name`** — the flow name (invoked by events like `on: { click: 'inc' }`, run by `FlowRunner`).
- **`steps`** — an **array of actions** (`ActionSpec`), executed **sequentially**. Each action is `{ do: '<tool>', ...args }`: `do` is the tool name, the other keys become `arg.<k>` (see "Flow actions" below).

`<FactUI app screen>` — the component that renders the screen. **`app`** = the `createFactApp` instance; **`screen`** = the screen name to render (string). It subscribes to the store and re-renders on every mutation.

> 💡 `components`, `action`, `onDispose` are **synchronous and chainable** (they return `app`); `screen`, `flow`, `facts`, `state` are **async** (they write to the KB) — `await` them before the first render.

**The `ScreenSpec` (the object passed to `app.screen` / `template`)** — every field is optional except `component`:

| Field | Role | Default |
|---|---|---|
| `component` | **(required)** name of the component to render (registry key) → `(node, component, …)` fact | — |
| `props?` | **static** props (`string \| number \| boolean`, stored as strings) → `prop.<k>` | `{}` |
| `bind?` | props **bound to state**; value = "s p" expression → `bind.<k>` | `{}` |
| `on?` | events → flows; key = event (`click`, `change`), value = flow name → `on_<event>` | `{}` |
| `showIf?` | conditional render of the **node** ("s p o", a comparator, or `not …`) → `show_if` | — (always rendered) |
| `forEach?` | list: "s p" expression whose each value yields a row (with `template`) | — |
| `template?` | `ScreenSpec` template rendered per item (`$item` = the value); requires `forEach` | — |
| `itemKey?` | stable React key by identity (e.g. `'$item'`); only meaningful with `forEach` | positional id |
| `children?` | ordered child `ScreenSpec[]` (mutually exclusive with `forEach`/`template`) | `[]` |
| `onMount?` | **root only**: flow (or list of flows) run on mount → `on_mount` | — |
| `guard?` | **root only**: page access condition (same grammar as `showIf`) → `guard` | — (no guard) |
| `denied?` | **root only**: fallback screen if `guard` fails; without it, nothing renders → `denied` | — (renders `null`) |

> ⚠️ `forEach`+`template` and `children` are **mutually exclusive**: a list has no static children (the template is its only descendant). `onMount`/`guard`/`denied` are read **only at the screen root** (ignored on a child node).

## What the UI does

1. **It draws itself from facts** — `(node, component, "Button")`, `(btn, prop.label, "+1")`,
   `(box, child, btn)`… ; React renders the tree produced by `renderTree`.
2. **It reacts via flows** — `(btn, on_click, "inc")` runs the `inc` flow (FlowRunner); its actions
   mutate **state** (also facts) → re-render. A **deterministic** loop.
3. **It changes at runtime** — adding a fact = adding a button; removing one makes it disappear. No
   rebuild.
4. **It is governed** — `show_if "alice can delete"` hides the button until the permission exists
   (RBAC); provenance/history trace who changed the screen and when.

## Capabilities

| Capability | How |
|---|---|
| Render from facts | `renderTree` (pure, deterministic, bounded) + a component *registry* |
| Reactive state | mutations via tools (`set`/`increment`/`toggle`) → re-render |
| Events | `on_click`/`on_change` → FlowRunner flows |
| Forms | `on_change` passes input → `$event` in the flow (`set value $event`) |
| Lists | `for_each "cart item"` + template ; `$item` in events ; `itemKey: '$item'` → React key by **identity** (no remount on reorder) |
| Conditional / RBAC (node) | `show_if`: `s p o` (existence), `s p OP v` (`>= <= != > < =`), `not <cond>` — KB read, zero token |
| Page security (RBAC) | `guard` (same grammar as `show_if`) gates the whole screen ; `denied` → fallback screen (login/403) |
| Navigation | `navigate` / `back` tools (history) + `<FactRouter app initial>` (renders the `route current` screen) ; or `show_if` to switch panels |
| Remote data | `http` tool (injected, hence mockable) → writes the result as facts |
| Loading & errors | `http` writes `(target, loading, true/false)` + `(target, error, msg)` ; an error never breaks the flow → `show_if "x loading = true"` / `show_if "x error"` |
| List CRUD | `append` / `remove` tools (`$event`/`$item`) → add/remove an item ; `set`/`toggle`/`increment` for scalars |
| **dev/prod** variants | injectable KB: a `LayeredKnowledgeBase` overlays a dev layer (most specific wins) |
| Hot-swap | `app.kb.tell(...)` / `retract(...)` then re-render |
| Mount (initial load) | `(screen, on_mount, flow)` → flow run on mount (e.g. load data) |

## Plain React or fact-driven UI?

The two approaches are **complementary** — this is not a React replacement (React stays the rendering
engine). The choice depends on **who** changes the screen, **when**, and **under what governance**.

| Criterion | "Plain" React | Fact-driven UI (`@damba/libxn-react-ui`) |
|---|---|---|
| Change the screen / behavior | recompile + redeploy | **at runtime**: add/remove a fact, **0 build** |
| Governance | none natively | **provenance + history** (who changed what, when), **node** + **page** RBAC |
| Variants (tenant, role, A/B, dev/prod) | code branches / flags | **overlays** via `LayeredKnowledgeBase` (most specific wins) |
| LLM-generated UI | arbitrary code (risky) | LLM **author** filtered + validated, **deterministic render** |
| Source of truth | state + props scattered | **the KB** (structure, state, behavior = facts) |
| Type safety | end-to-end (TS) | props are **strings** (coercion / adapter) |
| Rich props (objects, callbacks) | native | strings; objects via an **adapter component** |
| Performance | fine-grained, hand-tuned | re-render at **action granularity** (per-node memo not implemented) |
| Learning curve | standard React | + a **fact/flow vocabulary** to learn |
| Ecosystem / hiring | huge | your React library via the *registry* |

**When to use plain React.** **Bespoke**, highly interactive UIs (canvas, animations, gestures),
maximum **type safety** and rich props, fine performance on large trees, or a team that prefers
staying on standard tooling. Structure is frozen at build time — an advantage when it is **not** meant
to change without a deploy.

**When to use fact-driven UI.** Screens that must **change without redeploying**, be
**governed/audited** (who changed the screen, when), **vary per tenant/role/edition** (dev↔prod), or
be **prompt-generated** safely: forms, **CRUD**, admin panels, **dashboards**, onboarding flows,
config- or feature-flag-driven screens.

**Hybrid approach (recommended).** Mix them: **bespoke** components (a chart widget, a rich editor)
stay plain React, **registered in the *registry***; facts only **assemble and drive** them. You keep
governance/hot-swap where it adds value, without paying the string rigidity where bespoke wins.

## "Prompt → screen", safely

An LLM can **propose** a screen from a natural-language request — but it is **author, never
executor**. `proposeScreen` parses its answer into facts, then **filters**: only UI/flow-vocabulary
predicates, **allowed components** (`allowedComponents`) and **allowed actions** (`allowedActions`)
are kept; the rest goes to `rejected` (anti-injection). The rendering itself stays **deterministic**.

```ts
const proposal = await proposeScreen(llm, 'a login screen: email, password, button', {
  allowedComponents: ['Card', 'Input', 'Button'],
  allowedActions: ['set', 'toggle', 'navigate'],   // ⇐ what a proposed flow may invoke
});
if (isRenderable(proposal)) {
  await app.facts(proposal.facts);                  // proposal.rejected = discarded
  const check = app.checkFlows({ allowedTools: ['set', 'toggle', 'navigate'] }); // gate before render
  if (!check.ok) { /* … unbounded loop, dead link, forbidden tool → don't render … */ }
}
```

`allowedActions` closes the obvious hole: without it the LLM could wire `action http` +
`arg.url <exfiltration>`, a `navigate`, or an arbitrary `set`. `app.checkFlows()` then runs
`FlowValidator` over **every** flow in the KB (unbounded loop, dead link, incomplete condition,
out-of-allowlist tool) — the **dev→prod gate**, before any render.

**The arguments in detail:**

`proposeScreen(llm, demand, opts?)`:

- **`llm`** — an `LlmPort` (`{ complete(prompt, opts?) => Promise<string> }`, mockable in tests). The LLM is **author**, never executor.
- **`demand`** — the natural-language request (e.g. `'a login screen: email, password, button'`).
- **`opts?`** — filtering options (all optional):

| Argument | Role | Default |
|---|---|---|
| `opts.allowedComponents?` | allowlist of invocable components; a `component` outside it goes to `rejected` | — (any component accepted) |
| `opts.allowedActions?` | allowlist of **actions** (the object of an `action` predicate) a proposed flow may invoke; recommended in untrusted contexts | — (any action accepted) |
| `opts.systemPrompt?` | system prompt sent to the LLM | `SCREEN_AUTHORING_RULES` (the fact-format rules, exported) |

The return value is a **`ScreenProposal`**: `{ facts, rejected, screen?, raw }` — `facts` = **kept** triples (write them via `app.facts`), `rejected` = **discarded** triples (anti-injection), `screen` = the screen name inferred from the `render` fact (or `undefined`), `raw` = the LLM's raw response (audit).

`isRenderable(proposal)` — a single argument, the `ScreenProposal`; returns `true` if it carries a screen root (`proposal.screen !== undefined`). Minimal gate before writing.

`app.facts(triples)` — a single argument: an array of `[s, p, o]` triples (typically `proposal.facts`), written **case-preserved**. `await` it (writes to the KB).

`app.checkFlows(opts?)` — validates **every** flow present in the KB. Single option:

- **`opts.allowedTools?`** — an allowlist of tools; any flow invoking a tool outside it is marked invalid. Omitted → only the structural checks (unbounded loop, dead link, incomplete condition) apply.

Returns: `{ ok: boolean, flows: Array<{ flow, result }> }` — `ok` is `true` iff **all** flows are valid; `flows` details each flow and its `FlowValidationResult`.

### Interactive lists (`$item` in events)

In a `for_each`, a **row's** event knows **its** item via `$item` — so selecting, deleting or
editing a specific row needs no gymnastics:

```ts
await app.screen('cart', {
  component: 'List', forEach: 'cart item',
  template: { component: 'Row', props: { label: '$item' }, on: { click: 'pick' } },
});
await app.flow('pick', [{ do: 'set', path: 'cart selected', value: '$item' }]); // click on 'b': selected = 'b'
// per-item delete: { do: 'set', path: '$item removed', value: 'true' } + show_if "cart selected …"
```

**Item identity.** `itemKey: '$item'` keys by the **value**. ⚠️ The KB **deduplicates** identical
triples: two items with the **same value** ("Milk", "Milk") **collapse** into one — so you can't have
two "Milk" rows as bare values. For logical duplicates (and robust identity: individual removal,
per-row properties), model each item as an **entity**: the list holds distinct **ids** and the
template binds their properties. (A colliding `itemKey` — e.g. a constant — stays safe: an occurrence
suffix keeps React keys unique.)

```ts
// the list = ids; each id has its own facts → $item resolves to the id, bind its properties
await app.kb.tell('tasks', 'item', 't1'); await app.kb.tell('t1', 'label', 'Milk');
await app.kb.tell('tasks', 'item', 't2'); await app.kb.tell('t2', 'label', 'Milk'); // same label, distinct id
// template: { component:'Row', bind:{ text:'$item label' }, on:{ click:'toggle' } } + itemKey:'$item'
await app.flow('toggle', [{ do: 'toggle', path: '$item done' }]);   // toggles THIS row (by id)
await app.flow('del', [{ do: 'remove', path: 'tasks item' }]);      // removes the id (value default = $item)
```

**The `arg.*` of these actions (an `ActionSpec` = `{ do: '<tool>', ...args }`):**

| Tool (`do`) | Arguments | Effect |
|---|---|---|
| `set` | `path` ("s p"), `value` | writes the **single** state value (replaces the previous) |
| `toggle` | `path` ("s p") | flips a boolean `'true'`/`'false'` |
| `increment` | `path` ("s p"), `by?` (default **1**) | adds `by` to a numeric state |
| `append` | `path` ("s p"), `value` | adds a value to a **list** (without removing the others) |
| `remove` | `path` ("s p"), `value?` (**default = `$item`** of the row) | removes a value from the list |

`$event` (input value) and `$item` (the clicked `for_each` row item) are **substituted automatically** into the `arg.*` by the `FlowRunner` at execution time. `app.kb.tell(s, p, o)` writes a raw triple (the fact's three positions); here it seeds the list of ids and their properties.

## Page security (RBAC)

`show_if` protects a **node** (a button). To protect a **whole page**, the screen carries a
`guard`: a condition (same grammar as `show_if`) that must pass for the screen to render. If it
fails, `denied` names the **fallback** screen (login, 403); without `denied`, nothing renders.
Authorization **lives in the KB** — not in code:

```ts
await app.screen('admin', {
  component: 'Card',
  guard: 'session role admin',   // access condition (KB read, zero token)
  denied: 'login',               // otherwise → fallback screen (without denied: nothing)
  children: [ /* … admin panel … */ ],
});
await app.screen('login', { component: 'Card', children: [{ component: 'Text', props: { text: 'Sign in' } }] });
```

```ts
// Granting access = writing a fact (traced by provenance: who, when); revoking = removing it.
await app.kb.tell('session', 'role', 'admin');  app.store.touch();   // → admin page appears
await app.kb.retract('session', 'role', 'admin'); app.store.touch(); // → re-locked live (fallback)
```

**The low-level calls used here:**

- `app.kb.tell(s, p, o)` — writes the `(subject, predicate, object)` fact; `await` (async, traced by provenance). A 4th `source` option exists (who/where the fact comes from) but is not required.
- `app.kb.retract(s, p, o, reason?)` — retracts the `(s, p, o)` fact; `reason?` is an optional audit label. Returns `true` if a fact was retracted. **Synchronous** (no `await`).
- `app.store.touch()` — **no argument**: bumps the store version and notifies React → re-render. Call it **after** a manual `tell`/`retract` (hot-swap), since those writes bypass the tools that notify on their own.

> 💡 `app.kb.ask(s, p)` (used by guards/`show_if` under the hood) takes the **subject** and **predicate** and returns the **array** of known objects (`[]` if none) — pure KB read, zero token.

Consequences: access is **governed and auditable** (provenance/history trace every grant/revoke),
**hot-swappable** (changing a right redeploys nothing), and **deterministic** (the gate is a pure KB
read, never an effect). Looping `denied` redirects are bounded (fallback → `null`), so termination
is guaranteed. The condition accepts comparators and `not`
(e.g. `guard: 'not session banned true'`, `guard: 'session level >= 3'`).

> Security: `guard` hides the screen client-side — this is **UI governance**, not server-side access
> control. Sensitive data stays protected by the backend (the `http` port only returns what the user
> is allowed to see).

## Multi-screen navigation (`FactRouter`)

For real navigation between screens (rather than `show_if` panels), `<FactRouter>` renders the screen
named by `route current`; the `navigate` (go, pushes history) and `back` (return) tools drive the
route — still as facts.

```ts
await app.flow('toAbout', [{ do: 'navigate', to: 'about' }]);
await app.flow('goBack',  [{ do: 'back' }]);            // pops the history
// each screen is defined via app.screen('home'|'about', …)
export const App = () => <FactRouter app={app} initial="home" />;
```

`FactRouter` sets the initial route as a fact on mount, then re-renders on every `navigate`/`back`.
History is kept as a fact (`route stack`) → `back` is governed and traceable like everything else.

**The arguments in this block:**

- `navigate` action — a single `arg.to`: the target route. Pushes the current route onto history (`route stack`) then writes `(route, current, <to>)`.
- `back` action — **no argument**: pops history and restores the previous route. No effect if history is empty.
- `<FactRouter app initial?>` — **`app`** = the instance; **`initial?`** = the screen shown while no route is set (optional: without it, nothing renders until the first `navigate`).

**Lifecycle.** To release an app (close a socket opened outside the model, detach store
subscribers): `app.onDispose(() => socket.close())` then `app.dispose()`.

- `app.onDispose(fn)` — a single argument, the cleanup function (no argument, no return) run by `dispose()`. Chainable.
- `app.dispose()` — **no argument**: runs the registered cleanups then detaches store subscribers. **Idempotent** (safe to call again).

## Styling (CSS)

Props are passed **as-is** to the component. Styling = passing a prop your component applies — the
simplest being `className` (utility classes / your CSS):

```ts
// fact
{ component: 'Button', props: { label: 'Save', className: 'btn btn-primary' } }
```
```tsx
// your component (it owns the CSS)
const Button = (p: any) => (
  <button className={p.className} onClick={p.onClick}>{p.label}</button>
);
```

Fact values are **strings** → `className` is ideal. For inline `style` (React expects an object),
pass a string and let the component parse it, or expose dedicated props:

```tsx
const styleObj = (s = '') => Object.fromEntries(
  s.split(';').filter(Boolean).map(r => { const [k, v] = r.split(':'); return [k.trim(), v.trim()]; }),
);
const Box = (p: any) => <div style={styleObj(p.style)}>{p.children}</div>;
// fact: { component:'Box', props:{ style:'padding:8px; background:#eee' }, children:[…] }
```

## Server calls — HTTP & WebSocket

**HTTP**: inject an `http` port (a `fetch` wrapper), then a **flow** loads the data → writes it as
**facts** → the screen renders it (`bind`/`for_each`). Effect at the boundary, deterministic flow.

```ts
const app = createFactApp({
  http: (url, init) => fetch(url, init).then(r => r.json()),   // real port (mockable in tests)
});
app.components({ List, Item, Button });

await app.screen('shop', {
  component: 'Card',
  children: [
    { component: 'Button', props: { label: 'Load' }, on: { click: 'load' } },
    { component: 'List', forEach: 'cart item', template: { component: 'Item', props: { text: '$item' } } },
  ],
});
await app.flow('load', [{ do: 'http', url: '/api/items', list: 'cart item' }]);            // GET → list
await app.flow('save', [{ do: 'http', method: 'POST', url: '/api/cart', body: '$event' }]); // POST (body)
```

**The `http` port and the `http` action:**

`createFactApp({ http })` — the **port** is `(url, init?) => Promise<unknown>`: `url` is the address, `init?` an object `{ method?, body? }`, and the **resolved** value is the **already-parsed** body (hence `.then(r => r.json())`). It is the only side effect; injected, so mockable in tests.

The `http` flow action accepts these `arg.*`:

| Argument | Role | Default |
|---|---|---|
| `url` | the URL to call (`$event` supported) | — (required) |
| `method?` | HTTP verb | `'GET'` |
| `body?` | request body (e.g. `'$event'`) | — (no body) |
| `list?` | target "s p" where to write an **array** of results (via `replaceList`) | — |
| `set?` | target "s p" where to write a **scalar** | — |
| `status?` | explicit subject for the `loading`/`error` state | the **subject** (first word) of `list`/`set` |

Side effect: the action writes `(<status>, loading, true/false)` around the call and `(<status>, error, msg)` on failure — **an error never breaks the flow** (recorded, not rethrown).

To **load on mount** (no button), declare the flow as the screen's `onMount` — it is a fact
`(screen, on_mount, flow)` that `<FactUI>` runs once on mount:

```ts
await app.screen('shop', {
  component: 'List', forEach: 'cart item',
  template: { component: 'Item', props: { text: '$item' } },
  onMount: 'load',            // ← initial load, driven by a fact
});
```

**WebSocket**: open the socket **separately**; each message writes facts + notifies → re-render
(the store and KB are exposed, no extra API):

```ts
const ws = new WebSocket('wss://example/feed');
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  void app.store.replaceList('feed item', data.items); // writes facts + notifies
};
// a `for_each 'feed item'` screen shows the live stream, with no separate state.
```

`app.store.replaceList(path, values)` — **`path`** = the target list "s p" (e.g. `'feed item'`); **`values`** = the **array** of strings that **fully** replaces the list (old values are retracted). Writes the facts **then notifies** (re-render) — hence no separate React state. `await` it (async). The store also exposes `set` / `append` / `removeItem` / `increment` / `toggle` following the same "s p" convention.

**Using the data**: anything written as facts (by `http`, the socket, or `app.kb.tell`) is
immediately available to `bind`/`for_each`/`show_if` — there is **no** separate state to keep in
sync: the KB *is* the state.

**Loading & errors (as facts).** The `http` tool writes the request state: `(target, loading, true)`
at the start, `(target, loading, false)` at the end, and `(target, error, message)` on failure. The
`target` is the subject of `list`/`set` (e.g. `cart`), or an explicit `arg.status`. **An error never
breaks the flow** (it is recorded, not rethrown) — no more unhandled rejections. Spinner and message
are plain `show_if`s:

```ts
await app.flow('load', [{ do: 'http', url: '/api/cart', list: 'cart item' }]);
await app.screen('shop', {
  component: 'Card', onMount: 'load',
  children: [
    { component: 'Spinner', showIf: 'cart loading = true' },        // during the request
    { component: 'Text', bind: { text: 'cart error' }, showIf: 'cart error' }, // on failure (existence: "s p")
    { component: 'List', forEach: 'cart item', template: { component: 'Item', props: { text: '$item' } } },
  ],
});
```

> `show_if "cart error"` (two words) tests **existence** of a value; `show_if "cart loading = true"`
> compares. Both are zero-token KB reads.

## Integrations (axios, socket.io, gRPC, Tailwind, MUI…)

The package only depends on `react`. External libraries plug in at **three seams**, without touching
the core: the **`http` port**, **custom actions** (`app.action`, with access to `app.kb` /
`app.store`), and the **component registry**.

**axios** → the `http` port:
```ts
import axios from 'axios';
const app = createFactApp({
  http: (url, init) => axios.request({ url, method: init?.method ?? 'GET', data: init?.body }).then(r => r.data),
});
// your interceptors/auth/retry apply; `http` flows work unchanged
```

**Tailwind** (and CSS modules / styled) → `prop.className` (zero integration, compiled at build):
```ts
{ component: 'Button', props: { label: 'Save', className: 'px-4 py-2 rounded bg-blue-600 text-white' } }
```

**socket.io / SSE / WebSocket** → each message writes facts; to emit, a custom action:
```ts
import { io } from 'socket.io-client';
const socket = io('https://api.example.com');
socket.on('feed', (items: string[]) => { void app.store.replaceList('feed item', items); });
app.action('emit', async (i) => { socket.emit(String(i.event), i.payload); });
```

`app.action(name, fn)` — registers a **custom tool** invocable as `{ do: '<name>', … }` in a flow:

- **`name`** — the tool name (the object of an `action` predicate).
- **`fn`** — the function run: it receives `input` (a `Record<string, unknown>` = the step's `arg.*`, with `$event`/`$item` already resolved), may be `async`, return value ignored. Inside, `app.kb` and `app.store` are accessible to read/mutate facts.

Chainable (returns `app`). Here `i.event` / `i.payload` are the step's `arg.event` / `arg.payload`.

**gRPC / any SDK** → a custom action (the call is not "fetch-shaped"):
```ts
const app = createFactApp();
app.action('loadCart', async () => {
  const res = await grpcClient.list(new ListReq());
  await app.store.replaceList('cart item', res.getItemsList());
});
await app.flow('load', [{ do: 'loadCart' }]);   // + onMount:'load' to load on mount
```

**Component libraries (MUI / shadcn / Radix)** → the registry:
```tsx
import { Button, Card } from '@mui/material';
app.components({ Button, Card });   // facts: prop.variant 'contained' → MUI prop
```

> **Object props.** Fact values are **strings**; an **object/array** prop (e.g. MUI `sx`, a table's
> `columns`) cannot be passed directly. Register an **adapter component** that converts string props
> into the library's object props:
> ```tsx
> const DataTable = (p: any) => <MuiTable columns={JSON.parse(p.columns ?? '[]')} dense={p.dense === 'true'} />;
> app.components({ DataTable });   // fact: prop.columns '[{"key":"name"}]'
> ```

These libraries are **your** dependencies in **your** app — not in the package (which stays
dependency-free).

## Honest limits

- The UI **does not replace React**: it relies on it for rendering/reconciliation (stable keys =
  node id). It **does not invent components** — the app provides its library via the *registry*;
  facts only **assemble and drive** them.
- Effects (`http`) are **injected ports** (effect at the boundary); the flow stays deterministic.
