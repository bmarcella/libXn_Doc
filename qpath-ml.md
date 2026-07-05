# Réseaux QPath entraînables — apprendre sur le langage directionnel

À côté de la [prédiction par la grille](/prediction) (déterministe, sans poids), QPath sait aussi
**entraîner** de petits réseaux dont **l'entrée est la représentation directionnelle de QPath**, pas des
flottants bruts. On obtient des classifieurs et régresseurs **compacts**, **reproductibles** (graine
fixe), et dont la taille **ne dépend pas de la longueur** de l'entrée.

> 💡 **L'idée.** On encode une valeur, un enregistrement ou un texte en **entrée directionnelle**, puis on
> entraîne une tête légère par-dessus. Selon la tâche, on choisit un réseau **ordre-invariant** (rapide,
> profil global) ou **ordre-sensible** (lit la séquence). Tout est **déterministe** et **sérialisable**.

Le pipeline est toujours le même en trois temps : **encoder** l'entrée → **entraîner** (`fit`) →
**prédire** (`predict`). Les sections ci-dessous détaillent chaque brique et **chacun de ses paramètres**.

## Le vocabulaire commun (à lire une fois)

Ces notions reviennent dans toutes les briques. Les comprendre suffit à lire le reste.

| Terme | Ce que c'est | Comment le choisir |
|---|---|---|
| **quat** | une paire de 2 bits → une direction (LEFT/RIGHT/DOWN/UP). L'unité de base de QPath. | Fourni par l'encodeur ; vous ne le manipulez pas à la main. |
| **`bits`** | nombre de bits sur lequel un nombre est écrit avant d'être découpé en quats. **Doit être pair.** Défaut `8`. | Plus de bits = plus de **résolution** (distingue des valeurs proches) mais entrée plus longue. 8 suffit souvent ; 16 pour de grandes plages. |
| **`mode`** | comment un quat devient des traits : `'onehot'` (4 valeurs par quat, **défaut**) ou `'bits'` (2 valeurs, plus compact). | `'onehot'` par défaut (plus expressif). `'bits'` si vous voulez une entrée deux fois plus petite. |
| **`hidden`** | taille de l'**embedding directionnel** : le résumé de taille FIXE que le réseau construit de l'entrée, quelle que soit sa longueur. | Plus grand = plus de capacité (mais risque de sur-apprentissage). Typiquement 4–16. |
| **`readout` / `LayerSpec[]`** | la **tête** : une liste de couches `{ units, activation? }` empilées après l'embedding. La dernière couche = la sortie. | `[{ units: 1, activation: 'sigmoid' }]` pour une probabilité ; `units` = nombre de sorties. |
| **`activation`** | la non-linéarité d'une couche : `'sigmoid'` (0..1), `'relu'` (≥0), `'tanh'` (−1..1), `'identity'` (linéaire). | `sigmoid` pour une probabilité en sortie ; `relu`/`tanh` pour les couches internes ; `identity` pour une régression non bornée. Défaut d'une couche = `sigmoid`. |
| **`epochs`** | nombre de passages complets sur les données d'entraînement. **Obligatoire** dans `fit`. | Trop peu = sous-appris ; trop = sur-appris. 100–500 pour commencer. |
| **`lr`** | *learning rate* : la taille du pas d'ajustement des poids. Défaut `0.1`. | Trop grand = diverge ; trop petit = lent. `0.1` par défaut ; **`~0.01` pour du texte** (l'ASCII est dominé par une direction). |
| **`onEpoch`** | rappel optionnel `(epoch, loss)` appelé à chaque époque, pour tracer la courbe de perte. | Utile pour voir si l'apprentissage converge. |
| **`rng`** | générateur pseudo-aléatoire **seedé** (`mulberry32(graine)`). Défaut `mulberry32(1)`. | Fixez la graine → entraînement **rejouable au bit près**. Changez-la pour varier l'initialisation. |
| **échantillon** | une donnée d'entraînement. Réseaux directionnels : `{ quats, y }` ; MLP : `{ x, y }`. `y` est le **vecteur cible** attendu en sortie. | `y: [1]`/`[0]` pour classer ; `y: [valeur]` pour régresser. |

## Encoder une entrée — `QuatEncoder` / `TextQuatEncoder`

L'encodeur transforme une valeur, un objet ou un texte en entrée directionnelle prête pour les réseaux.
C'est une **boîte noire** : vous lui donnez la donnée, il rend l'entrée.

```ts
import { QuatEncoder, TextQuatEncoder } from '@damba/libxn-qpath-ml';

const enc  = new QuatEncoder({ bits: 8, mode: 'onehot' });  // valeurs & enregistrements
const text = new TextQuatEncoder({ bitsPerChar: 16 });       // texte (par caractère UTF-16)

enc.encode({ surface: 120, prix: 30 });                      // un enregistrement -> traits (longueur stable)
enc.quatsOf(42);                                             // un nombre -> quats (à passer à un réseau)
text.quatsOf('profession');                                 // un mot -> quats
```

**`QuatEncoder({ bits?, mode? })`**

| Paramètre | Type | Défaut | Rôle |
|---|---|---|---|
| `bits` | `number` (pair) | `8` | Résolution : bits par valeur avant découpage en quats. Impair → erreur. |
| `mode` | `'onehot' \| 'bits'` | `'onehot'` | Largeur des traits par quat (4 vs 2 valeurs). |

Méthodes : `quatsOf(value)` → `Quat[]` (pour les réseaux) · `encode(value \| record)` → traits aplatis
(pour un MLP) · `featureSize` = `nbClés × (bits/2) × (4 si onehot, 2 si bits)`, la taille d'entrée d'un MLP.

**`TextQuatEncoder({ bitsPerChar?, maxChars? })`** — encode du **texte**, un caractère à la fois (code
UTF-16 → `bitsPerChar` bits → quats).

| Paramètre | Type | Défaut | Rôle |
|---|---|---|---|
| `bitsPerChar` | `number` (pair) | `16` | Bits par caractère (16 = UTF-16 complet). |
| `maxChars` | `number` | — | Tronque au-delà de N caractères (borne la longueur). |

Méthode : `quatsOf(text)` → `Quat[]`.

## Classer / régresser — réseau directionnel

`DirectionalNet` apprend une propriété à partir du **profil directionnel** de l'entrée. Sa partie
spécialisée a une **taille fixe**, **quelle que soit la longueur** de l'entrée — idéal pour des entrées de
tailles variées. Il est **ordre-invariant** : il lit le profil global, pas la séquence.

```ts
import { QuatEncoder, DirectionalNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const data = rows.map(r => ({ quats: enc.quatsOf(r.valeur), y: [r.label] }));   // label 0/1

const net = new DirectionalNet(8, [{ units: 1, activation: 'sigmoid' }], { act: 'relu' });
net.fit(data, { epochs: 300, lr: 0.1 });

net.predict(enc.quatsOf(nouvelleValeur));            // → [probabilité]
```

**`new DirectionalNet(hidden, readout, opts?)`**

| Paramètre | Type | Défaut | Rôle |
|---|---|---|---|
| `hidden` | `number` | — | Taille de l'embedding directionnel (capacité, indépendante de la longueur d'entrée). |
| `readout` | `LayerSpec[]` | — | La tête : couches `{ units, activation? }` après l'embedding. Dernière couche = sortie. |
| `opts.act` | `Activation` | `'relu'` | Activation de la **couche directionnelle** (l'embedding). |
| `opts.rng` | `Rng` | `mulberry32(1)` | Graine d'initialisation (déterminisme). |

`fit(data, { epochs, lr?, onEpoch? })` où `data: { quats, y: number[] }[]` · `predict(quats)` → `number[]`
· `paramCount` = nombre total de poids.

## Quand l'ORDRE compte — réseau récurrent

Certaines tâches dépendent de **l'ordre** de la séquence (pas seulement du profil global). `DirectionalRecurrentNet`
**lit** l'entrée pas à pas et capte ces dépendances, là où un réseau ordre-invariant plafonnerait.

```ts
import { QuatEncoder, DirectionalRecurrentNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const rnn = new DirectionalRecurrentNet(6, [{ units: 1, activation: 'sigmoid' }], { act: 'tanh' });
rnn.fit(data, { epochs: 300, lr: 0.1 });
rnn.predict(enc.quatsOf(x));                          // → [probabilité]
```

**`new DirectionalRecurrentNet(hidden, readout, opts?)`** — même interface que `DirectionalNet`.

| Paramètre | Type | Défaut | Rôle |
|---|---|---|---|
| `hidden` | `number` | — | Taille de l'état récurrent (mémoire portée d'un pas au suivant). |
| `readout` | `LayerSpec[]` | — | La tête de lecture après la séquence. |
| `opts.act` | `Activation` | `'tanh'` | Activation du **cœur récurrent** (`tanh` borne l'état, standard en récurrent). |
| `opts.rng` | `Rng` | `mulberry32(1)` | Graine d'initialisation. |

> Un MLP profond générique (`MLP`) reste disponible pour des features déjà aplaties — pratique en repère,
> mais le réseau directionnel est le chemin **QPath-natif** (taille fixe, longueur-agnostique).

**`new MLP(inputSize, specs, rng?)`** — perceptron multicouche classique sur des vecteurs déjà aplatis.

| Paramètre | Type | Défaut | Rôle |
|---|---|---|---|
| `inputSize` | `number` | — | Longueur du vecteur d'entrée (ex. `encoder.featureSize`). |
| `specs` | `LayerSpec[]` | — | Couches empilées `{ units, activation? }` (`activation` défaut `'sigmoid'`). |
| `rng` | `Rng` | `mulberry32(1)` | Graine d'initialisation. |

`fit(data, { epochs, lr?, rng?, onEpoch? })` où `data: { x: number[], y: number[] }[]` · `predict(x)` → `number[]`.

## Router un fait — `FactRouter`

`FactRouter` classe un **candidat déjà extrait** : son **type** (ex. *fait / compagnon / coffre / média*)
et des **drapeaux** indépendants (ex. *cascade*). Il **ne génère pas** les triplets (ça reste le pipeline
déterministe) ; il **décide** où ranger un candidat. Petit, entraînable, **sérialisable**.

```ts
import { TextQuatEncoder, FactRouter } from '@damba/libxn-qpath-ml';

const enc = new TextQuatEncoder();
const router = new FactRouter(4, { hidden: 10, numFlags: 1 });   // 4 types, 1 drapeau

router.fit(
  exemples.map(e => ({ quats: enc.quatsOf(e.predicat), type: e.type, flags: [e.cascade] })),
  { epochs: 300, lr: 0.01 },   // ⚠️ petit lr pour du texte (voir « choisir ses valeurs »)
);

router.predict(enc.quatsOf('profession'));
//   → { type: 0, typeProbs: [...], flags: [0.92] }

// Persistance : un petit JSON, rechargé à l'identique.
const json = router.toJSON();
const meme = FactRouter.fromJSON(json);
```

**`new FactRouter(numTypes, opts?)`**

| Paramètre | Type | Défaut | Rôle |
|---|---|---|---|
| `numTypes` | `number` | — | Nombre de **types** possibles (tête softmax : un seul type gagne). |
| `opts.hidden` | `number` | `8` | Taille de l'embedding directionnel. |
| `opts.numFlags` | `number` | `0` | Nombre de **drapeaux** indépendants (têtes sigmoïdes multi-label). `0` = aucun. |
| `opts.act` | `Activation` | `'relu'` | Activation de la couche directionnelle. |
| `opts.rng` | `Rng` | `mulberry32(1)` | Graine d'initialisation. |

`fit(data, { epochs, lr?, onEpoch? })` où `data: { quats, type: number, flags?: number[] }[]` ·
`predict(quats)` → `{ type, typeProbs: number[], flags: number[] }` (le type gagnant, les probas de chaque
type, et chaque drapeau ∈ 0..1) · **`toJSON()` / `FactRouter.fromJSON(json)`** pour ranger/recharger le modèle.

## Choisir ses valeurs (guide pratique)

- **`epochs`** — commencez à 100–300. Surveillez la perte via `onEpoch` : si elle stagne, augmentez ;
  si elle remonte, c'est du sur-apprentissage (réduisez).
- **`lr`** — `0.1` par défaut. **Pour du texte**, passez à **`~0.01`** : l'ASCII écrit en 16 bits est
  dominé par la direction LEFT (bits de poids fort à 0), et un grand pas fait diverger l'apprentissage.
- **`hidden`** — plus grand = plus de capacité, mais plus de risque de sur-apprentissage et plus de
  calcul. 4–8 pour un signal simple, 10–16 pour du texte ou des classes nombreuses.
- **`bits` / `mode`** — augmentez `bits` (8 → 16) si vos valeurs couvrent une large plage et que le
  réseau confond des valeurs proches. `mode: 'bits'` réduit de moitié la taille d'entrée si besoin.
- **Activation de sortie** — `sigmoid` pour une probabilité (0..1), `identity` pour une régression non
  bornée, `softmax` (via `FactRouter`) pour choisir UNE classe parmi plusieurs.
- **Graine (`rng`)** — fixez-la pour des résultats reproductibles ; variez-la pour tester la stabilité.

## Les fonctions (résumé)

- **`QuatEncoder({ bits?, mode? })`** — encode une valeur/objet ; `encode`, `quatsOf`, `featureSize`.
  **`TextQuatEncoder({ bitsPerChar?, maxChars? })`** — encode du **texte** (`quatsOf`).
- **`DirectionalNet(hidden, readout, { act?, rng? })`** — réseau ordre-invariant ; `fit(data, { epochs, lr?, onEpoch? })`,
  `predict(quats)`, `paramCount`. Partie directionnelle de **taille fixe**.
- **`DirectionalRecurrentNet(hidden, readout, { act?, rng? })`** — variante **ordre-sensible** ; même interface.
- **`MLP(inputSize, specs, rng?)`** — perceptron multicouche générique (features aplaties).
- **`FactRouter(numTypes, { hidden?, numFlags?, act?, rng? })`** — classe un candidat : `predict`
  (`{ type, typeProbs, flags }`), `fit`, **`toJSON` / `fromJSON`**.

## Cas d'usage

| Besoin | Réseau |
|---|---|
| Classer / scorer à partir d'un **profil** d'entrée, longueurs variées | `DirectionalNet` |
| Tâche qui dépend de **l'ordre** de la séquence | `DirectionalRecurrentNet` |
| **Router** un candidat de fait (type + drapeaux) vers le bon anneau | `FactRouter` |
| Repère avec des features déjà aplaties | `MLP` |

> 🔁 **Reproductible & portable.** À graine fixe, l'entraînement est rejouable à l'identique, et un modèle
> tient dans un **petit JSON** (`toJSON`/`fromJSON`) — facile à ranger côté serveur et à recharger.

## Pour aller plus loin

- [Prédiction (grille)](/prediction) — régression / classification **sans poids**, directement sur la grille.
- [Mémoire qui apprend (nap-grid)](/nap-grid) — le graphe qui grandit **est** le réseau (mémoire + apprentissage).
- [Mémoire d'entités](/entity-memory) — similarité & trait manquant, **sans entraînement**.
- [Extraction de faits](/fact-extraction) — d'où viennent les candidats que `FactRouter` classe.
