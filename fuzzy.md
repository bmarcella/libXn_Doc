# Logique floue — répondre en nuances, prouver en chiffres

« Est-ce que Paris est chaud ? » n'a pas de réponse binaire honnête : 28 °C, c'est *plutôt* chaud. La
**logique floue** de QPath répond en **degré** (« Plutôt chaud — degré 0.6 ») calculé exactement depuis
la valeur stockée, avec la preuve à l'appui. Déterministe, **0 token**, et fidèle au principe de la
maison : l'ignorance reste de l'ignorance — si la valeur manque, le moteur ne répond pas « degré 0 »,
il dit qu'il ne sait pas.

> 💡 **Le principe.** Un adjectif comme « chaud », « riche » ou « proche » devient un **terme flou** :
> une zone graduée sur une grandeur numérique (la température, le salaire, la distance). La réponse
> n'est plus oui/non mais un degré d'appartenance entre 0 et 1 — toujours accompagné de la valeur qui
> l'a produit.

> 🎯 **Cas d'usage.** Vous définissez « chaud » une fois ; ensuite chaque question du type « est-ce que
> X est chaud ? » est répondue en nuance, pour n'importe quel sujet qui porte une température. Les
> règles graduées enchaînent : « si le moteur est chaud, la salle est à risque » propage le degré au
> lieu de le tronquer en booléen.

## Définir un terme en langage naturel

Aucun formulaire, aucune formule : une phrase suffit. Quatre formes couvrent les usages courants :

| Forme | Vous dites |
|---|---|
| montée | « chaud pour la température : à partir de 25, total à 35 » |
| descente | « froid pour la température : total jusqu'à 5, plus du tout à 15 » |
| pic | « tiède pour la température : autour de 20, entre 15 et 25 » |
| plateau | « confortable pour la température : de 18 à 30, total de 21 à 26 » |

Le parseur est **conservateur** : les bornes doivent être explicites, rien n'est inventé, et une phrase
ambiguë est refusée avec une explication — mieux vaut redemander que stocker une définition fausse. La
définition enregistrée est relisible et modifiable comme n'importe quel savoir de la mémoire.

## Répondre en degré, prouver en chiffres

Une fois « chaud » défini et « la température de Paris est 30 » connu :

> **Est-ce que Paris est chaud ?**
> Plutôt chaud (degré 0.5 · température = 30).

La réponse montre toujours **la valeur qui l'a produite** : on peut la vérifier, la contester, la
recalculer. Deux personnes qui posent la même question sur les mêmes faits obtiennent le même degré,
aujourd'hui et dans un an.

## Les règles graduées

Les termes flous se composent en règles qui **propagent le degré** au lieu de l'écraser : la conclusion
d'une règle hérite de la force de ses conditions, les chaînes convergent de façon bornée, et le passage
au binaire (agir / ne pas agir) n'arrive qu'au **moment de la décision**, jamais en cours de route. Les
faits dérivés gardent leur degré en provenance : on sait qu'une conclusion est « sûre à 0.7 » et
pourquoi.

## En pratique

```ts
import { FuzzyEngine, parseFuzzyDefinition } from '@damba/libxn';

const p = parseFuzzyDefinition('chaud pour la température : à partir de 25, total à 35');
await new FuzzyEngine(kb).defineTerm(p.def, { kind: 'user', ref: 'chat' });

await kb.tell('paris', 'température', '30');
new FuzzyEngine(kb).degreeOf('paris', p.def.term);
// → { degree: 0.5, trace: { predicate: 'température', value: 30 } }
```

La logique floue complète la [croyance bayésienne](/belief) : le flou gradue **ce que valent les
valeurs** (28 °C est-il chaud ?), la croyance gradue **ce que vaut le savoir** (à quel point ce fait
est-il établi ?). Les deux répondent en nuances, preuves à l'appui.
