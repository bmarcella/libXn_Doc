# Mémoire compacte (lexkey)

`@damba/libxn-lexkey` donne à chaque mot une **identité stable adressée par son contenu**, pour deux
gains concrets : une mémoire **plus compacte** (on ne stocke chaque terme qu'une fois) et **fusionnable**
entre machines sans coordination. Zéro dépendance, tourne à l'identique dans le navigateur et sur le serveur.

Trois couches, séparées par ce qui change ou non dans le temps :

| Couche | Rôle | Change ? |
|---|---|---|
| **Identité** | l'adresse d'un mot, dérivée de son seul contenu | non (immuable) |
| **Prior** | une croyance mesurée (fréquence d'une langue) | oui (observée) |
| **Résolution** | départager une forme ambiguë à la lecture | sans état |

## L'identité d'un mot

L'adresse d'un mot est une empreinte de 128 bits calculée à partir de sa forme normalisée. Deux
propriétés en découlent :

- **Déterministe et universelle.** Le même mot donne toujours la même adresse, sur n'importe quelle
  machine. Deux mémoires qui n'ont jamais communiqué calculent la même adresse pour le même mot.
- **Indépendante de toute croyance.** Ré-estimer un prior, changer de contexte, rien de tout cela ne
  déplace une adresse. C'est ce qui la rend utilisable comme **identifiant stable**.

```ts
import { contentHash, TermInterner } from '@damba/libxn-lexkey';

contentHash('Paris', 'fr'); // toujours la même empreinte 128 bits
```

## Stocker des identifiants, pas des mots répétés

La même mémoire répète les mêmes termes partout (un même sujet, un même prédicat reviennent dans des
centaines de faits). `TermInterner` mémorise chaque terme **une seule fois** et référence les autres
occurrences par un **identifiant compact**, tout en conservant le mot exact affichable.

```ts
const terms = new TermInterner();
const ids = terms.internTriple('Paris', 'located_at', 'France'); // [0, 1, 2]
terms.internTriple('Lyon', 'located_at', 'France');              // 'located_at' et 'France' réutilisés
terms.resolveTriple(ids);                                        // ['Paris','located_at','France']
```

Deux poignées, chacune utile : un **identifiant** local et compact (le « numéro » stocké) et une
**adresse** globale stable (pour la fusion). Le mot lisible est **toujours** conservé : l'adresse est
irréversible, la mémoire reste auditable.

## Fusionner deux mémoires par adresse

Parce que le même mot a la même adresse partout, deux mémoires se fusionnent **sans coordination** :
on rapproche les termes par leur adresse et on réécrit les références. Aucun catalogue central, aucun
accord préalable.

```ts
const remap = memoireA.merge(memoireB); // rapproche par adresse, renvoie la correspondance des ids
```

## Persistance compacte

Un `SnapshotCodec` déduplique la mémoire persistée : les termes **et** les métadonnées de provenance
qui se répètent sont stockés une fois. La reconstitution est **exacte** (mots, casse, accents
préservés) ; un instantané au format hérité se relit sans conversion. Sur une mémoire réelle, la
réduction de taille va d'environ **10 à 35 %** selon la taille et la richesse des données.

> **Ce que lexkey n'est pas.** Une adresse ne remplace pas le texte : c'est une empreinte, pas une
> compression réversible. QPath continue de stocker et d'afficher le mot. lexkey apporte l'identité
> stable, l'interning et la fusion, pas un encodage secret des mots.
