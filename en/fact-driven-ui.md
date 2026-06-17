# Fact-driven UI

The thesis "**an application's behavior is governed facts**" extends to the **frontend**: the screen
(structure) AND its behavior live in facts; **React is just a rendering engine**. Adding or removing
a fact changes the screen **at runtime, without redeploying** — **deterministically, traceably and
under governance**. It is Server-Driven UI, but with QPath as the source.

> Package `@damba/libxn-react-ui` (optional React binding, outside the core). The core stays
> framework-agnostic: it produces a data tree (`renderTree`); React consumes it.

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
| Lists | `for_each "cart item"` + a template (`$item` = the value) |
| Conditional / RBAC | `show_if "s p o"` (KB read, zero token) |
| Navigation | `navigate` tool → route + `show_if` to switch panels |
| Remote data | `http` tool (injected, hence mockable) → writes the result as facts |
| **dev/prod** variants | injectable KB: a `LayeredKnowledgeBase` overlays a dev layer (most specific wins) |
| Hot-swap | `app.kb.tell(...)` / `retract(...)` then re-render |

## "Prompt → screen", safely

An LLM can **propose** a screen from a natural-language request — but it is **author, never
executor**. `proposeScreen` parses its answer into facts, then **filters**: only UI/flow-vocabulary
predicates and **allowed components** are kept; the rest goes to `rejected` (anti-injection). The
rendering itself stays **deterministic**.

```ts
const proposal = await proposeScreen(llm, 'a login screen: email, password, button',
  { allowedComponents: ['Card', 'Input', 'Button'] });
if (isRenderable(proposal)) { await app.facts(proposal.facts); } // proposal.rejected = discarded
```

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

**Using the data**: anything written as facts (by `http`, the socket, or `app.kb.tell`) is
immediately available to `bind`/`for_each`/`show_if` — there is **no** separate state to keep in
sync: the KB *is* the state.

## Honest limits

- The UI **does not replace React**: it relies on it for rendering/reconciliation (stable keys =
  node id). It **does not invent components** — the app provides its library via the *registry*;
  facts only **assemble and drive** them.
- Effects (`http`) are **injected ports** (effect at the boundary); the flow stays deterministic.
