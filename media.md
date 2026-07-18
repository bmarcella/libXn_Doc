# Médias — images & audio dans la mémoire

Sauvegarder des **médias** (image, audio) **avec** des faits et du texte : une photo rattachée à un
produit, une note vocale à un message, un visuel à un dossier. Le média est stocké, **décrit**, et
**interrogeable** — et il se supprime avec ce à quoi il est rattaché.

> **Image, audio et vidéo.** La vidéo est stockée, décrite et recherchée comme les autres ; sa
> recherche par contenu passe par des **images-clés** (voir plus bas).

> 🎯 **Cas d'usage.** Une photo rattachée à un produit, une note vocale à un message, un visuel à un
> dossier : le média est stocké, décrit par des faits (donc **interrogeable**) et se supprime **avec** ce à
> quoi il est rattaché. Le problème résolu : garder l'image ou le son **dans la même mémoire** que le texte,
> retrouvable et gouverné par les mêmes règles (dont le droit à l'oubli en cascade).

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
await media.get(att.ref);            // { blob: { bytes, mime } | null, meta: { … } }  ← relire les octets (blob null si absent du store)
```

**`new MediaFacts(kb, store, index?)`** — câble la couche médias sur ta mémoire :

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la `KnowledgeBase` où vivent les **faits-liens** (`owner → a_image/a_audio/a_video`) et les **métadonnées** (mime, alt, transcript…) | requis |
| `store` | le `MediaStore` qui détient les **octets**, adressés par hash de contenu (`InMemoryMediaStore` en test ; Postgres/FS/S3 en prod) | requis |
| `index?` | un `MediaIndex` pour la **recherche par similarité** perceptuelle. **Omis** → `attach` n'indexe rien et `similar()` retourne `[]` | `undefined` |

**`media.attach(owner, kind, blob, meta?, code?)`** — stocke les octets, écrit le fait-lien (compagnon `cascade`) et les métadonnées globales. Retourne `{ ref, kind, ownerRef }` (`ref` = hash de contenu réutilisé partout) :

| Argument | Rôle | Défaut |
|---|---|---|
| `owner` | le **propriétaire** : `{ entity: 'produit#7' }` (une entité) **ou** `{ fact: { s, p, o } }` (un fait précis) | requis |
| `kind` | le **type** : `'image' \| 'audio' \| 'video'` — détermine le prédicat-lien (`a_image`/`a_audio`/`a_video`) | requis |
| `blob` | les octets : `{ bytes: Uint8Array, mime: string }` | requis |
| `meta?` | métadonnées globales : `{ mime?, alt?, transcript?, width?, height?, durationMs? }`. `alt`/`transcript` sont du **texte interrogeable** (casse préservée) | `{}` |
| `code?` | l'**encodage perceptuel** (`[number, number][]`, des quats). Fourni **et** un `index` présent → le média est indexé pour `similar()` | `undefined` |

> 💡 Les métadonnées sont **globales au média** (écrites une seule fois, au 1ᵉʳ `attach`) car le même `ref` peut être partagé par plusieurs propriétaires. Le **type** effectif, lui, vient du fait-lien — fiable même pour un média partagé sous plusieurs types.

**`media.get(ref)`** — un seul argument, la **référence** du média. Retourne `{ blob, meta }` : `blob` vaut `{ bytes, mime }` ou **`null`** si les octets sont absents du store (purgés, ou jamais arrivés), et `meta` est un dictionnaire `prédicat → valeur` (la casse d'affichage d'`alt`/`transcript` est restituée).

## Rattaché à une entité OU à un fait, supprimé en cascade

Le média est un **compagnon** de son propriétaire (une **entité** ou un **fait précis**), avec
`cascade` : supprimer le propriétaire — ou `media.remove(ref)` — retire le média **et** ses
métadonnées (archivés, jamais perdus).

```ts
media.mediaOf({ entity: 'produit#7' });   // [{ ref, kind: 'image' }, …]
await media.remove(att.ref);              // octets + faits retirés
```

**`media.mediaOf(owner)`** — un argument, le **propriétaire** (même forme que `attach` : `{ entity }` ou `{ fact }`). Lit les **faits-liens** (robuste au partage) et retourne la liste `{ ref, kind }` des médias rattachés. (À ne pas confondre avec `ownersOf(ref)`, qui fait l'inverse : les propriétaires d'un média donné.)

**`media.remove(ref)`** — un argument, la **référence**. Supprime **définitivement** le média : tous ses liens + métadonnées (archivés, jamais perdus) **et** ses octets, y compris les compagnons imbriqués. Retourne `{ retracted, bytesDeleted }` (nombre de faits archivés, et `true` si les octets étaient présents).

> ⚠️ `remove` est **inconditionnel** : il efface le média pour **tous** ses propriétaires. Pour ne retirer le média que d'**un seul** propriétaire (et ne supprimer les octets que s'il ne reste plus aucun lien), utilise plutôt `media.detach(owner, ref)`, qui retourne `{ detached, removed }`.

## Recherche de médias proches

Indexé par son **encodage perceptuel** (calculé par les encodeurs côté navigateur), un média devient
cherchable par **similarité** : des images ou des sons proches se ressemblent dans l'index.

```ts
media.similar(codeRequete, 5);   // [{ ref, sharedDepth }, …]  les plus proches d'abord
```

**`media.similar(code, limit?)`** — recherche par préfixe perceptuel partagé :

- `code` — l'**encodage perceptuel** de la requête (`[number, number][]`, des quats), produit par le même encodeur que les médias indexés.
- `limit?` — nombre maximal de résultats (**défaut `5`**).

Retourne un tableau `MediaHit` : `{ ref, sharedDepth }`, où `sharedDepth` est la **longueur du préfixe de quats partagé** avec la requête (plus c'est grand, plus c'est proche). Sans `MediaIndex` au constructeur, retourne `[]`.

Le classement est **déterministe** et **« plus proche d'abord »** : à préfixe perceptuel partagé égal,
les correspondances les plus exactes ressortent en premier — ce qui compte quand on limite le nombre de
résultats. Indexer deux fois le même média ne crée pas de doublon, et **supprimer un média le retire
aussi de l'index** (plus de média « fantôme » qui continuerait d'apparaître).

L'encodage vient de [`@damba/libxn-encoders`](04-guides/architecture) : `PerceptualEncoder`
(image → empreinte perceptuelle multi-résolution) et `AudioEncoder` (audio → spectrogramme →
empreinte). Le cœur reste **sans canvas** : l'appli calcule l'encodage, la mémoire l'indexe.

### Vidéo : similarité par images-clés

Une vidéo n'a pas un code unique mais une suite d'**images-clés** (keyframes). Côté navigateur,
`VideoEncoder.captureKeyframes(video, n)` échantillonne `n` keyframes ; on les indexe toutes vers la
même vidéo, qui devient alors retrouvable dès qu'**une** image-clé ressemble à la requête.

```ts
import { VideoEncoder } from '@damba/libxn-encoders';

const { codes, thumbnail } = await VideoEncoder.captureKeyframes(videoEl, 8);
const att = await media.attach({ entity: 'incident#9' }, 'video',
  { bytes, mime: 'video/mp4' }, { transcript: 'la porte s\'ouvre' });
media.indexFrames(att.ref, codes);          // chaque keyframe → pointe la vidéo

media.similar(uneImageCle);                  // retrouve la vidéo si une keyframe ressemble
media.searchMedia({ kind: 'video', text: 'porte' });   // ou par les faits (type + transcription)
```

**`VideoEncoder.captureKeyframes(video, frames?)`** (paquet `@damba/libxn-encoders`, couche navigateur) :

- `video` — un `HTMLVideoElement` dont les **métadonnées sont chargées** (événement `loadedmetadata`), sinon durée/dimensions sont inconnues.
- `frames?` — nombre d'images-clés à échantillonner, réparties au milieu de segments égaux (**défaut `VideoEncoder.DEFAULT_FRAMES` = 8**).

Retourne `{ codes, thumbnail, durationMs }` : `codes` est un encodage perceptuel **par** image-clé (`Array<[number, number][]>`, à passer tel quel à `indexFrames`), `thumbnail` une vignette dataURL PNG de la 1ᵉʳ image-clé, et `durationMs` la durée en millisecondes.

**`media.indexFrames(ref, frameCodes)`** — indexe plusieurs encodages pointant tous vers la **même** vidéo :

- `ref` — la référence de la vidéo (renvoyée par `attach`).
- `frameCodes` — les encodages des images-clés (`Array<[number, number][]>`, typiquement le `codes` de `captureKeyframes`).

Ne retourne rien (`void`). Sans `MediaIndex` au constructeur, c'est un no-op.

**`media.searchMedia(query?)`** — recherche **via les faits** (et non par similarité), tous les critères combinés en **ET** :

| Champ de `query` | Rôle | Défaut |
|---|---|---|
| `text?` | sous-chaîne cherchée dans `alt` **ou** `transcript` (insensible à la casse) | — (aucun filtre texte) |
| `kind?` | type `'image' \| 'audio' \| 'video'` — filtré sur le **prédicat-lien** (fiable pour un média multi-type) | — (tous types) |
| `owner?` | clé d'owner exacte : nom d'entité, ou réf de fait (`fact:<id>`) | — (tous owners) |

Appelé sans argument (`searchMedia()`), retourne **tous** les médias. Le résultat est une liste `{ ref, kind }`.

La recherche par **type** (image / audio / vidéo) reste fiable même pour un média **partagé** entre
plusieurs propriétaires ou rattaché sous plusieurs types : le type vient du **lien de rattachement**,
pas d'une métadonnée écrite une seule fois.

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
