# Médias — images & audio dans la mémoire

Sauvegarder des **médias** (image, audio) **avec** des faits et du texte : une photo rattachée à un
produit, une note vocale à un message, un visuel à un dossier. Le média est stocké, **décrit**, et
**interrogeable** — et il se supprime avec ce à quoi il est rattaché.

> **Image, audio et vidéo.** La vidéo est stockée, décrite et recherchée comme les autres ; sa
> recherche par contenu passe par des **images-clés** (voir plus bas).

## Le principe : référence + métadonnées en faits, octets dans un store

Un fait stocke une **chaîne**, pas des octets. Donc un média = une **référence** (hash de contenu) +
des **métadonnées** en faits ; les octets vont dans un **`MediaStore`** injecté (mémoire, Postgres,
filesystem, S3…). Le hash de contenu **déduplique** automatiquement (le même média = la même référence).

```ts
import { MediaFacts, MediaIndex, InMemoryMediaStore } from '@damba/libxn';

const media = new MediaFacts(kb, new InMemoryMediaStore(), new MediaIndex());

// Attacher une image à un produit, avec une description (texte interrogeable) + son encodage perceptuel.
const att = await media.attach(
  { entity: 'produit#7' }, 'image',
  { bytes, mime: 'image/png' },
  { alt: 'Chat sur un canapé', width: 1024, height: 768 },
  code,                              // encodage perceptuel (voir « Recherche de médias proches »)
);

kb.ask('produit#7', 'a_image');      // [att.ref]               ← le lien, en fait
kb.ask(att.ref, 'alt');              // ['chat sur un canapé']  ← texte trouvable (RAG / recherche)
await media.get(att.ref);            // { blob: { bytes, mime }, meta: { … } }  ← relire les octets
```

## Rattaché à une entité OU à un fait, supprimé en cascade

Le média est un **compagnon** de son propriétaire (une **entité** ou un **fait précis**), avec
`cascade` : supprimer le propriétaire — ou `media.remove(ref)` — retire le média **et** ses
métadonnées (archivés, jamais perdus).

```ts
media.mediaOf({ entity: 'produit#7' });   // [{ ref, kind: 'image' }, …]
await media.remove(att.ref);              // octets + faits retirés
```

## Recherche de médias proches

Indexé par son **encodage perceptuel** (calculé par les encodeurs côté navigateur), un média devient
cherchable par **similarité** : des images ou des sons proches se ressemblent dans l'index.

```ts
media.similar(codeRequete, 5);   // [{ ref, sharedDepth }, …]  les plus proches d'abord
```

L'encodage vient de [`@damba/libxn-encoders`](04-guides/architecture) : `PerceptualEncoder`
(image → empreinte perceptuelle multi-résolution) et `AudioEncoder` (audio → spectrogramme →
empreinte). Le cœur reste **sans canvas** : l'appli calcule l'encodage, la mémoire l'indexe.

### Vidéo : similarité par images-clés

Une vidéo n'a pas un code unique mais une suite d'**images-clés** (keyframes). Côté navigateur,
`VideoEncoder.captureKeyframes(video, n)` échantillonne `n` keyframes ; on les indexe toutes vers la
même vidéo, qui devient alors retrouvable dès qu'**une** image-clé ressemble à la requête.

```ts
const { codes, thumbnail } = await VideoEncoder.captureKeyframes(videoEl, 8);
const att = await media.attach({ entity: 'incident#9' }, 'video',
  { bytes, mime: 'video/mp4' }, { transcript: 'la porte s\'ouvre' });
media.indexFrames(att.ref, codes);          // chaque keyframe → pointe la vidéo

media.similar(uneImageCle);                  // retrouve la vidéo si une keyframe ressemble
media.searchMedia({ kind: 'video', text: 'porte' });   // ou par les faits (type + transcription)
```

## La limite honnête

- La recherche par **contenu** reste **grossière** (empreinte perceptuelle) ou **textuelle**
  (alt / transcription) — pas une compréhension fine sans modèle dédié.
- **Les octets ne vivent pas dans la mémoire** : ils sont dans le `MediaStore` injecté ; la KB ne
  porte que la **référence** et la **description**. C'est ce qui garde le cœur léger et la mémoire
  entièrement interrogeable.

---

::: tip Aller plus loin
Persistance durable des faits via [Postgres](persistence) ; un adaptateur `MediaStore` durable
(Postgres `bytea`, filesystem, S3, IndexedDB) se branche par le même port.
:::
