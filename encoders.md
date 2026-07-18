# Encodeurs — texte, tableaux, image, audio, vidéo

## Le problème

Une grille QPath ne mémorise, ne compare et ne prédit que sur une **représentation interne** commune.
Mais le monde arrive sous des formes hétérogènes : un mot, une ligne de tableau, une photo, un son, une
vidéo. Sans une étape de conversion, chaque modalité vivrait dans son propre silo et rien ne pourrait se
comparer. Les **encodeurs** résolvent ça : ils transforment n'importe quelle entrée en la **même forme**,
en **préservant la similarité** (deux entrées proches se rangent au même endroit). La grille apprend
ensuite dessus sans rien savoir de la source.

> 💡 **Une seule abstraction.** Quelle que soit la modalité, la sortie a la même forme. C'est ce qui
> permet de mélanger texte, image et son dans **une même mémoire**.

## Texte & données tabulaires

**Le problème.** Classer un mot ou prédire une valeur numérique (un prix, un score) exige d'abord de
poser texte et nombres dans la grille, de façon **reproductible** : la même entrée doit toujours donner
le même encodage.

```ts
import { SemanticEncoder, TabularEncoder } from '@damba/libxn';

const encoded = SemanticEncoder.toPairs('HELLO');           // texte → encodage

const enc = new TabularEncoder(['surface', 'pieces', 'zone']);
const row = enc.encode({ surface: 80, pieces: 3, zone: 2 }); // ligne → encodage
```

`SemanticEncoder.toPairs` encode une primitive (texte, nombre, booléen) en gardant les valeurs proches
proches ; le texte est traité caractère par caractère. `TabularEncoder` encode une ligne colonne par
colonne, dans l'**ordre fixe** déclaré à la construction : c'est cet ordre figé qui rend deux lignes du
même jeu de données comparables et reproductibles.

**Cas d'usage.** Prédire un prix immobilier : `new TabularEncoder(['surface','pieces','zone'])`, encoder
chaque ligne, entraîner la grille, puis prédire le prix d'un bien inédit. Voir [prédiction](/prediction).

## Image — du grossier au fin

**Le problème.** On veut reconnaître ou regrouper des images **sans dataset d'entraînement massif**.
`PerceptualEncoder` (`@damba/libxn-encoders`) encode une image **du grossier au fin** — la forme globale
d'abord, le détail ensuite. Deux photos de chat se ressemblent donc dès les premiers niveaux, ce qui donne
une **généralisation gratuite** : la ressemblance suffit à classer.

```ts
import { PerceptualEncoder } from '@damba/libxn-encoders';
import { XNeuroneGrid } from '@damba/libxn';

const encoded = await PerceptualEncoder.encodeFromFile(file); // depuis <input type="file">
const grid = new XNeuroneGrid();
grid.train(encoded, 'chat');

const query = await PerceptualEncoder.encodeFromImage(img);
grid.predictClass(query);                                     // → { label: 'chat', … }
```

Trois points d'entrée selon la source : `encodeFromFile` (un fichier, ex. depuis un `<input type="file">`),
`encodeFromImage` (une image déjà dans le DOM), et `encodeFromSource` (une source générique — canvas,
vidéo, `ImageBitmap`), la brique commune par laquelle passent image et vidéo.

**Cas d'usage.** Reconnaissance visuelle « par similarité » : entraîner la grille avec quelques images
étiquetées, puis classer une image inédite par ressemblance, sans phase d'entraînement lourde.

## Audio & vidéo

**Le problème.** Le son et la vidéo sont temporels : il faut les **échantillonner** puis les encoder pour
les mémoriser et les retrouver (empreinte vocale, retrouver une vidéo par une image proche).

```ts
import { AudioEncoder, VideoEncoder } from '@damba/libxn-encoders';

const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaStreamSource(stream).connect(analyser);
const { encoding, thumbnail, audioUrl } = await AudioEncoder.capture(ctx, analyser, stream, 2000);

const { codes, thumbnail: vthumb } = await VideoEncoder.captureKeyframes(videoEl, 8);
```

`AudioEncoder.capture` enregistre le son depuis le micro (via Web Audio API) pendant une durée donnée,
l'encode, et renvoie de quoi l'afficher et le rejouer (une vignette de spectrogramme et une URL rejouable).
`VideoEncoder.captureKeyframes` répartit un nombre d'images-clés (8 par défaut) sur la durée de la vidéo et
renvoie **un encodage par image**, plus une vignette.

**Cas d'usage.** Retrouver une vidéo à partir d'une image proche : indexer les `codes` de chaque vidéo,
puis chercher la keyframe la plus ressemblante à une image requête.

## Récapitulatif

| Modalité | Fonction clé | Cas d'usage |
|---|---|---|
| **Texte / tabulaire** | `SemanticEncoder.toPairs` · `TabularEncoder` | classer un mot, prédire un prix immobilier |
| **Image** | `PerceptualEncoder.encodeFrom*` | reconnaissance visuelle par similarité |
| **Audio** | `AudioEncoder.capture` | empreinte vocale, reconnaissance de sons |
| **Vidéo** | `VideoEncoder.captureKeyframes` | retrouver une vidéo par une image-clé proche |

> 🧱 **Le point commun.** Tous produisent le **même type d'encodage** que la même grille apprend — voir
> [prédiction](/prediction) pour entraîner/prédire, et [recherche sémantique](/semantic-search) pour
> chercher par le sens côté texte.
