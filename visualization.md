# Visualisation 3D du graphe QPath

QPath est une mémoire **graphe** : les sujets, prédicats et valeurs vivent sur des nœuds reliés par
directions. `@damba/libxn-visualization` rend ce graphe **en 3D** dans le navigateur, pour explorer la
mémoire, suivre un chemin de raisonnement, et déboguer la topologie à l'œil.

> 💡 **Le rendu est découplé du cœur.** Le noyau `@damba/libxn` est **headless par défaut** : il ne connaît
> que l'interface `GridView` (mettre à jour, redimensionner, surligner un chemin). La lib de visualisation
> en fournit une implémentation Three.js. On peut donc utiliser QPath sans aucune dépendance graphique, et
> brancher le rendu seulement côté navigateur.

> 🎯 **Cas d'usage.** Une réponse vous surprend et vous voulez comprendre *pourquoi*. La vue 3D montre le
> graphe de la mémoire et **surligne le chemin de raisonnement** emprunté, nœud par nœud. Le problème
> résolu : **explorer et déboguer** la mémoire à l'œil (topologie, chemin d'une déduction), au lieu de lire
> des listes de faits à plat.

## Brancher le rendu

On injecte une fabrique de vue dans la grille, une fois, avant de construire des grilles.

```ts
import { XNeuroneGrid } from '@damba/libxn';
import { XNeuroneVisualizerForGrid } from '@damba/libxn-visualization';

// Au chargement du module (côté navigateur) :
XNeuroneGrid.viewFactory = (door) => new XNeuroneVisualizerForGrid(door);

const grid = new XNeuroneGrid();          // la grille s'auto-équipe d'une vue
document.body.appendChild(grid.view.getDomElement() as HTMLElement);
```

Sans `viewFactory`, la grille reste **headless** (aucun coût graphique). C'est le mode des tests, du
serveur, et de tout usage purement mémoire.

## L'interface `GridView`

Le cœur ne dépend que de ce contrat ; n'importe quel moteur de rendu peut l'implémenter.

| Méthode | Rôle |
|---|---|
| `update(door)` | reconstruit/rafraîchit la vue à partir du nœud d'entrée |
| `resize(w, h)` | adapte le rendu à la taille du conteneur |
| `resetCamera()` | recentre la caméra sur le graphe |
| `highlightPath(path, stepDelayMs?, durationMs?)` | anime un chemin de nœuds (trace de raisonnement) |
| `getDomElement()` | l'élément à insérer dans la page |
| `dispose()` | libère la boucle d'animation, le contexte WebGL, les listeners |

## Ce que rend l'implémentation Three.js

- **Nœuds** en `InstancedMesh` et **arêtes** en `LineSegments` : un seul draw call par type, pour tenir
  des graphes de **dizaines de milliers de nœuds** (budget borné par parcours en largeur).
- **Picking & infobulles** : survoler un nœud affiche le fait/valeur qu'il porte.
- **Surlignage de chemin** animé : `highlightPath` met en évidence la suite de nœuds visitée par une
  lecture ou un raisonnement, pour *voir* d'où vient une réponse.
- **Contrôles** : un doigt pour déplacer, deux doigts pour zoomer et pivoter.

## À savoir

- **Navigateur uniquement** (Three.js / WebGL) : la lib n'est pas chargée côté Node. Le cœur, lui, reste
  utilisable partout.
- **Appelez `dispose()`** quand vous détachez la vue. Une vue Three.js non libérée fuit le contexte GPU
  (plafond du navigateur autour de 16 par onglet) et continue de rendre en arrière-plan.
- Le mapping bit → direction (LEFT/RIGHT/DOWN/UP) qui place les nœuds est le même que celui du cœur :
  la position 3D **reflète la structure réelle** des chemins QPath, pas une mise en page arbitraire.

## Quand l'utiliser

- **Explorer** une mémoire : voir les regroupements de sujets, les préfixes partagés, les zones denses.
- **Expliquer** une réponse : surligner le chemin d'un `reason`/`ask` rend le raisonnement tangible.
- **Déboguer** : repérer une topologie inattendue (sujets fusionnés, branches mortes) d'un coup d'œil.
