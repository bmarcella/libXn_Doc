# Encodeurs — texte, tableaux, image, audio, vidéo

Avant d'apprendre quoi que ce soit, QPath doit **transformer une entrée en une représentation
interne**. Les **encodeurs** s'en chargent pour chaque type de données — un mot, une ligne de tableau,
une image, un son, une vidéo — en **préservant la similarité** : deux entrées proches se rangent au
même endroit dans la mémoire.

> 💡 **Une seule abstraction.** Quelle que soit la modalité, la sortie a la **même forme**. La grille
> apprend ensuite dessus (mémoire, prédiction, similarité) sans rien savoir de la source.

## Texte & données tabulaires

```ts
import { SemanticEncoder, TabularEncoder, XNeuroneGrid } from '@damba/libxn';

// Texte → encodage (les caractères proches restent proches).
const encoded = SemanticEncoder.toPairs('HELLO');

// Ligne numérique → encodage, ordre des colonnes FIXE (reproductible).
const enc = new TabularEncoder(['surface', 'pieces', 'zone']);
const row = enc.encode({ surface: 80, pieces: 3, zone: 2 });
```

- **`SemanticEncoder.toPairs(data)`** — encode n'importe quelle primitive (texte, nombre, booléen) en
  une représentation exploitable par la grille.
- **`new TabularEncoder(features)`** puis **`encode(row)`** — encode une ligne `{ colonne: nombre }` ;
  l'ordre des colonnes garantit la reproductibilité.

## Image — du grossier au fin

`PerceptualEncoder` (paquet `@damba/libxn-encoders`) encode une image **du grossier au fin** : la forme
globale d'abord, le détail ensuite. Deux images de chat se ressemblent donc dès le départ →
**généralisation gratuite**.

```ts
import { PerceptualEncoder } from '@damba/libxn-encoders';

const encoded = await PerceptualEncoder.encodeFromFile(file);   // depuis un <input type="file">
const grid = new XNeuroneGrid();
grid.train(encoded, 'chat');

// Une autre image de chat se rangera au même endroit.
const query = await PerceptualEncoder.encodeFromImage(img);
grid.predictClass(query);                                        // → { label: 'chat', … }
```

- **`encodeFromFile(file)` / `encodeFromImage(img)` / `encodeFromSource(src)`** — encode une image
  (du grossier au fin). `encodeFromSource` accepte un canvas / une vidéo / un `ImageBitmap`.

## Audio & vidéo

```ts
import { AudioEncoder, VideoEncoder } from '@damba/libxn-encoders';

// Audio : capture le micro et l'encode (avec une vignette + un lien rejouable).
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaStreamSource(stream).connect(analyser);
const { encoding, thumbnail, audioUrl } = await AudioEncoder.capture(ctx, analyser, stream, 2000);

// Vidéo : plusieurs images-clés réparties sur la durée, chacune encodée.
const { codes, thumbnail: vthumb } = await VideoEncoder.captureKeyframes(videoEl, 8);
```

- **`AudioEncoder.capture(ctx, analyser, stream, ms?)`** — enregistre le son, l'encode, et renvoie de
  quoi l'afficher/rejouer (`thumbnail`, `audioUrl`).
- **`VideoEncoder.captureKeyframes(video, frames?)`** — échantillonne `frames` images-clés (8 par
  défaut) et renvoie **un encodage par image** (`codes`).

## Cas d'usage

| Modalité | Exemple d'usage |
|---|---|
| **Texte / tabulaire** | classer un mot, prédire un prix immobilier (`TabularEncoder` + grille) |
| **Image** | reconnaissance visuelle ; la ressemblance donne une classification « par similarité » |
| **Audio** | empreinte vocale / reconnaissance de sons |
| **Vidéo** | retrouver une vidéo par une image-clé proche (`captureKeyframes` + recherche) |

> 🧱 **Le point commun.** Tous produisent le **même type d'encodage** que la même grille apprend — voir
> [prédiction](/prediction) pour entraîner/prédire, et [recherche sémantique](/semantic-search) pour
> chercher par le sens côté texte.
