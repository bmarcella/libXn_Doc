# 3D visualization of the QPath graph

QPath is a **graph** memory: subjects, predicates and values live on nodes linked by directions.
`@damba/libxn-visualization` renders that graph **in 3D** in the browser, to explore the memory, follow a
reasoning path, and debug the topology by eye.

> 💡 **Rendering is decoupled from the core.** The `@damba/libxn` kernel is **headless by default**: it only
> knows the `GridView` interface (update, resize, highlight a path). The visualization library provides a
> Three.js implementation. So you can use QPath with no graphics dependency, and plug rendering in only on
> the browser side.

> 🎯 **Use case.** An answer surprises you and you want to understand *why*. The 3D view shows the memory
> graph and **highlights the reasoning path** taken, node by node. The problem it solves: **explore and
> debug** the memory visually (topology, the path of a deduction), instead of reading flat lists of facts.

## Plugging in rendering

You inject a view factory into the grid, once, before building grids.

```ts
import { XNeuroneGrid } from '@damba/libxn';
import { XNeuroneVisualizerForGrid } from '@damba/libxn-visualization';

// At module load (browser side):
XNeuroneGrid.viewFactory = (door) => new XNeuroneVisualizerForGrid(door);

const grid = new XNeuroneGrid();          // the grid self-equips a view
document.body.appendChild(grid.view.getDomElement() as HTMLElement);
```

Without `viewFactory`, the grid stays **headless** (no graphics cost). That is the mode for tests, servers,
and any pure-memory use.

## The `GridView` interface

The core depends only on this contract; any renderer can implement it.

| Method | Role |
|---|---|
| `update(door)` | rebuilds/refreshes the view from the entry node |
| `resize(w, h)` | fits the rendering to the container size |
| `resetCamera()` | recenters the camera on the graph |
| `highlightPath(path, stepDelayMs?, durationMs?)` | animates a path of nodes (reasoning trace) |
| `getDomElement()` | the element to insert into the page |
| `dispose()` | releases the animation loop, the WebGL context, the listeners |

## What the Three.js implementation renders

- **Nodes** as an `InstancedMesh` and **edges** as `LineSegments`: a single draw call per type, to hold
  graphs of **tens of thousands of nodes** (budget bounded by a breadth-first walk).
- **Picking & tooltips**: hovering a node shows the fact/value it carries.
- **Animated path highlight**: `highlightPath` lights up the sequence of nodes visited by a read or a
  reasoning step, so you can *see* where an answer comes from.
- **Controls**: one finger to pan, two fingers to zoom and rotate.

## Good to know

- **Browser only** (Three.js / WebGL): the library is not loaded on Node. The core stays usable everywhere.
- **Call `dispose()`** when you detach the view. An unreleased Three.js view leaks the GPU context (browser
  cap around 16 per tab) and keeps rendering in the background.
- The bit → direction mapping (LEFT/RIGHT/DOWN/UP) that places nodes is the same as the core's: the 3D
  position **reflects the real structure** of QPath paths, not an arbitrary layout.

## When to use it

- **Explore** a memory: see subject clusters, shared prefixes, dense regions.
- **Explain** an answer: highlighting the path of a `reason`/`ask` makes the reasoning tangible.
- **Debug**: spot an unexpected topology (merged subjects, dead branches) at a glance.
