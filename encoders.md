# Encodeurs — texte, tableaux, image, audio, vidéo

Tout, dans QPath, devient une suite de **paires de bits** parcourant la grille. Les **encodeurs**
traduisent une entrée (un mot, une ligne de données, une image, un son, une vidéo) en ces paires, en
**préservant la similarité** : deux entrées proches partagent un préfixe de chemin — donc se rangent
au même endroit.

> 💡 **Une seule abstraction.** Quelle que soit la modalité, la sortie est la même : `[number, number][]`.
> La grille apprend ensuite dessus (mémoire, prédiction, similarité) sans rien savoir de la source.

## Texte & données tabulaires

```ts
import { SemanticEncoder, TabularEncoder, XNeuroneGrid } from '@damba/libxn';

// Texte → paires (code de Gray, caractères proches = bits proches).
const pairs = SemanticEncoder.toPairs('HELLO');

// Ligne numérique → paires, ordre des colonnes FIXE (reproductible).
const enc = new TabularEncoder(['surface', 'pieces', 'zone'], 16 /* bits par colonne */);
const rowPairs = enc.encode({ surface: 80, pieces: 3, zone: 2 });
```

- **`SemanticEncoder.toPairs(data)` → `[number, number][]`** — convertit n'importe quelle primitive
  (texte, nombre, booléen) en paires de bits.
- **`new TabularEncoder(features, width?)`** puis **`encode(row)` → `[number, number][]`** — encode une
  ligne `{ colonne: nombre }` ; l'ordre des colonnes garantit la reproductibilité.

## Image — multi-résolution, du grossier au fin

`PerceptualEncoder` (paquet `@damba/libxn-encoders`) encode une image en **plusieurs résolutions**
(4×4 → 8×8 → 16×16) : les premiers bits captent la forme globale, les suivants le détail. Deux images
de chat partagent donc leurs **premiers** bits → généralisation gratuite.

```ts
import { PerceptualEncoder } from '@damba/libxn-encoders';

const pairs = await PerceptualEncoder.encodeFromFile(file);   // depuis un <input type="file">
const grid = new XNeuroneGrid();
grid.train(pairs, 'chat');

// Une autre image de chat se rangera au même endroit.
const queryPairs = await PerceptualEncoder.encodeFromImage(img);
grid.predictClass(queryPairs);                                 // → { label: 'chat', … }
```

- **`encodeFromFile(file)` / `encodeFromImage(img)` / `encodeFromSource(src)`** — image → paires de bits
  (coarse-to-fine). `encodeFromSource` accepte un canvas / une vidéo / un `ImageBitmap`.

## Audio & vidéo

```ts
import { AudioEncoder, VideoEncoder } from '@damba/libxn-encoders';

// Audio : micro → spectrogramme → mêmes bits perceptuels qu'une image.
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaStreamSource(stream).connect(analyser);
const { pairs, thumbnail, audioUrl } = await AudioEncoder.capture(ctx, analyser, stream, 2000);

// Vidéo : N images-clés réparties sur la durée, chacune encodée.
const { codes, thumbnail: vthumb } = await VideoEncoder.captureKeyframes(videoEl, 8);
```

- **`AudioEncoder.capture(ctx, analyser, stream, ms?)` → `{ pairs, thumbnail, audioUrl }`** — enregistre,
  construit un spectrogramme, l'encode comme une image ; `thumbnail`/`audioUrl` pour l'UI.
- **`VideoEncoder.captureKeyframes(video, frames?)` → `{ codes, thumbnail, durationMs }`** — échantillonne
  `frames` images-clés (8 par défaut), renvoie **un encodage par image** (`codes`).

## Cas d'usage

| Modalité | Exemple d'usage |
|---|---|
| **Texte / tabulaire** | classer un mot, prédire un prix immobilier (`TabularEncoder` + grille) |
| **Image** | reconnaissance visuelle ; la similarité hiérarchique donne une classification « par ressemblance » |
| **Audio** | empreinte vocale / reconnaissance de sons (spectrogramme → bits) |
| **Vidéo** | retrouver une vidéo par une image-clé proche (`captureKeyframes` + recherche) |

> 🧱 **Le point commun.** Tous produisent des `[number, number][]` que la même grille apprend — voir
> [prédiction](/prediction) pour entraîner/prédire, et [recherche sémantique](/semantic-search) pour
> chercher par le sens côté texte.
