# Réalisation — mettre les faits en phrases

La [déduction générative](/generative-deduction) produit du **nouveau savoir** (des faits déduits) ; la
**Réalisation** fait l'étape d'après : elle transforme un fait connu `(sujet, prédicat, objet)` en une
**phrase française lisible**. QPath énonce ce qu'il **sait**, pas ce qu'il imagine. Déterministe, **0
token**, aucune invention : la phrase ne dit rien qui ne soit déjà dans la mémoire.

> 💡 **Le principe.** Répondre en langage naturel sans « générer du texte au hasard ». On part d'un fait
> réel et on l'**habille** : la bonne préposition, le bon article, la copule, l'accord, les listes. La
> forme est produite par des règles ; le **contenu** reste un fait stocké.

## L'inverse exact de la lecture

QPath lit déjà les tournures infinies du langage et les ramène à un petit jeu de **relations
canoniques** (« je viens de Jacmel », « je suis originaire de Jacmel » et « je suis natif de Jacmel »
désignent la même relation d'origine). La Réalisation parcourt ce pont **dans l'autre sens** : d'une
relation connue vers une phrase naturelle. Comme le stockage reste **en surface** (le prédicat est déjà
un verbe, « habite », « vient de »), réaliser consiste surtout à replacer les petits mots que la lecture
avait absorbés.

## Le juge : l'aller-retour

C'est la garantie qui distingue la Réalisation d'un « générateur de texte » : elle est **vérifiable par
construction**. On réalise le fait en phrase, puis on **relit** cette phrase par le lecteur de QPath ; si
elle retombe sur la **même relation** et le **même objet**, la réalisation a **préservé le sens**.

```
fait : (marie, habite, Paris)
   │  réalisation
   ▼
« Marie habite à Paris. »
   │  relecture (le lecteur de QPath)
   ▼
relation « localisation », objet Paris   ✓  identique au fait de départ
```

Ce contrôle est **déterministe** et ne peut pas être trompé : pas de modèle de fluence à satisfaire, pas
de score à maximiser. Une phrase qui ne se relit pas au même sens est simplement rejetée.

## Ce que la v1 sait dire

| Type de fait | Exemple d'entrée | Phrase produite |
| --- | --- | --- |
| Classe (est un/une) | `(jacmel, est_une, ville)` | **Jacmel est une ville.** |
| Attribut / profession | `(jean, est, médecin)` | **Jean est médecin.** |
| Localisation | `(marie, habite, paris)` | **Marie habite à Paris.** |
| Origine | `(pierre, vient_de, jacmel)` | **Pierre vient de Jacmel.** |
| Objets multiples | `(marie, habite, [paris, lyon])` | **Marie habite à Paris et Lyon.** |

L'article de classe suit le **genre** (une ville / un médecin), le sujet est **capitalisé**, et les noms
gardent leur **casse d'affichage** d'origine.

## En pratique

```ts
import { realizeFact } from '@damba/libxn';

realizeFact({ s: 'jacmel', p: 'est_une', o: 'ville' }, { gender: () => 'f' });
// → « Jacmel est une ville. »

realizeFact({ s: 'marie', p: 'habite', o: 'paris' }, { typer });
// → « Marie habite à Paris. »   (le « à » est ajouté ; la phrase se relit en « localisation »)

realizeFact({ s: 'pierre', p: 'vient_de', o: 'jacmel' }, { typer });
// → « Pierre vient de Jacmel. »
```

- `gender(w)` fournit le genre (pour l'article) ; `display(w)` la casse d'affichage ; `typer` type
  l'objet (lieu, personne, organisation) pour choisir la bonne tournure. Tout est **optionnel** : sans
  contexte, la Réalisation reste correcte sur les cas simples.
- `realizeStructured(fact)` renvoie en plus le **verbe** et la **préposition** employés, ce qui permet
  de rejouer l'aller-retour et de **certifier** la phrase.

## Dire un fait de plusieurs façons (recombinaison)

Un même fait peut se dire de plusieurs manières, **toutes vraies**. QPath sait que « habiter », « vivre »,
« résider », « se trouver à » et « être à » désignent la même relation ; il peut donc **recombiner** ces
formes attestées pour varier le langage sans jamais changer le sens :

```ts
import { recombineFact } from '@damba/libxn';

recombineFact({ s: 'marie', p: 'habite', o: 'paris' }, { typer });
// → [ « Marie habite à Paris. », « Marie est à Paris. », « Marie se trouve à Paris. », … ]
```

**Chaque variante passe le même contrôle aller-retour** : elle se relit à la même relation et au même
objet. La variété est donc gratuite en fluidité mais **jamais au prix de la vérité** (aucun mot n'est
remplacé par un synonyme approximatif qui glisserait le sens). `pickVariant(fact, graine)` choisit une
formulation de façon **déterministe** (même graine → même phrase) pour éviter la répétition robotique tout
en restant reproductible.

Côté produit, on peut simplement demander à QPath « **dis-le autrement** » : il reprend son dernier énoncé
et propose une autre formulation attestée du même fait, sans jamais en changer le sens.

## Redire une scène comprise

Quand une phrase contient un pronom (« Marc a laissé tomber le verre, **il** est cassé »), QPath comprend
d'abord à **quoi** le pronom renvoie (ici le verre, pas Marc), puis **redit** la scène correctement :

```
« Marc a laissé tomber le verre, donc il est cassé. »
```

La reformulation attribue chaque état à la **bonne** entité, ajoute le connecteur logique (« donc », « puis »),
et emploie un pronom de reprise uniquement quand c'est sûr. Comme partout dans la Réalisation, rien n'est
inventé : QPath réutilise les mots réellement écrits et la phrase produite se **relit** à la même scène.

## Où ça s'inscrit

La Réalisation est la **voix** de la mémoire : partout où QPath doit répondre par une phrase à propos de
ce qu'il connaît (décrire une entité, confirmer un fait), elle produit un énoncé **fluide, ancré et
vérifiable**, sans solliciter de génération libre. Elle se combine naturellement avec la [déduction
générative](/generative-deduction) (qui trouve *quoi* dire) et le [raisonnement](/reasoning-types) (qui
décide *si* on peut le dire).

> La force reste le **structuré et le vérifiable** : QPath met en mots ce qu'il sait, et chaque phrase
> peut être relue jusqu'au fait dont elle est née.
