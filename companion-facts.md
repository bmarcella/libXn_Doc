# Faits compagnons & sections

Souvent, un bloc de faits **appartient** à quelque chose : le profil d'une personne, les métadonnées
d'un document, les lignes d'une facture. `CompanionFacts` **rattache** ces faits à un **propriétaire**
(une entité ou un fait précis), pour les lire en bloc et les **rétracter ensemble**.

> 💡 **Toujours des faits ordinaires.** Un compagnon reste un triplet interrogeable normalement ; il
> porte juste un lien vers son propriétaire — et, si on le veut, une **cascade** (il disparaît avec lui).

## Rattacher un profil

```ts
import { CompanionFacts } from '@damba/libxn';

const comp = new CompanionFacts(kb);
const owner = { entity: 'bigvai' };

await comp.attach(owner, 'bigvai', 'adresse', 'port-au-prince');
await comp.attach(owner, 'bigvai', 'né_le', '1991-01-01');

comp.profileOf(owner);     // { adresse: ['port-au-prince'], 'né_le': ['1991-01-01'] }
kb.ask('bigvai', 'adresse'); // → ['port-au-prince']   (un compagnon est un fait normal)
```

- **`attach(owner, s, p, o, opts?)` → `Promise<string>`** — écrit le fait **et** le tague comme
  compagnon du propriétaire (renvoie son id). `opts.cascade` lie son sort à celui du propriétaire.
- **`tag(owner, s, p, o)`** — tague un fait **déjà existant** comme compagnon (sans le réécrire).
- **`profileOf(owner)` → `Record<string, string[]>`** — le profil structuré `{ prédicat: [valeurs] }`.
- **`companionsOf(owner)` → `EnumeratedFact[]`** — tous les faits du propriétaire (suit les alias si
  l'entité a été fusionnée via `same_as`).

## Métadonnées d'un fait

Le propriétaire peut être **un triplet précis** — par exemple décrire un compte, pas la personne :

```ts
await kb.tell('bigvai', 'a', 'compte_12345');
const compte = { fact: { s: 'bigvai', p: 'a', o: 'compte_12345' } };

await comp.attach(compte, 'compte_12345', 'ouvert_le', '2020-06-01', { cascade: true });
await comp.attach(compte, 'compte_12345', 'solde', '1000', { cascade: true });
```

- **`CompanionOwner`** = `{ entity: string }` (profil d'entité) **ou** `{ fact: { s, p, o } }`
  (métadonnées d'un fait). **`ownerOf(s, p, o)`** retrouve le propriétaire d'un compagnon.

## Rétracter en bloc

```ts
comp.retractOwner({ entity: 'document:cv' });  // propriétaire + compagnons `cascade` (un niveau)
comp.retractTree({ entity: 'facture:123' });   // tout l'arbre (compagnon d'un compagnon…)
```

- **`retractOwner(owner, reason?)` → `{ retracted }`** — rétracte le propriétaire et ses compagnons
  `cascade` (sur **un** niveau).
- **`retractTree(owner, reason?)` → `{ retracted }`** — rétracte **récursivement** tout l'arbre (un
  compagnon peut lui-même être propriétaire). Tout reste **archivé** (annulable).

## Cas d'usage

| Situation | Apport |
|---|---|
| **Profil** d'une personne (adresse, naissance, contacts) groupé et interrogeable | `attach` + `profileOf` |
| **Section de document** : tous les faits d'un fichier, rétractables ensemble | propriétaire `document:<nom>`, `cascade:true` |
| **Métadonnées** d'un fait (compte → date d'ouverture, solde) | propriétaire `{ fact }` |
| Données **imbriquées** (facture → lignes) supprimées d'un coup | `retractTree` |

> 🧩 **Convention QPath.** L'ingestion d'un document rattache chaque fait extrait au document
> (`document:<nom>`, `cascade:true`) : tous les faits d'un fichier forment une **section** qui cascade à
> la rétractation. Voir aussi [provenance](/fact-provenance) et [types de faits](/fact-types).
