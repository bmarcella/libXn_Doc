# Routage de faits

Une fois un fait **extrait** d'un texte, reste une question : **comment le ranger ?** Un fait ordinaire va
dans la mémoire ; un fait rattaché à un parent devient **compagnon** (et se rétracte en cascade) ; une valeur
sensible part au **coffre** ; une pièce jointe devient un **média**. Le routage de faits **décide ce type de
rangement** pour chaque fait candidat, et les **drapeaux** associés (cascade, verrouillé, structurant).

> 💡 **Aiguiller le rangement, pas comprendre la phrase.** Le [routage d'intention](/intent-routing) répond
> à « *que veut l'utilisateur ?* » (une décision par message). Le routage de faits répond à « *comment ranger
> ce fait ?* » (une décision **par fait**, en aval de l'extraction). Les deux sont complémentaires.

> 🎯 **Cas d'usage.** D'un même message, un mot de passe doit partir au **coffre** (chiffré, hors
> raisonnement), l'adresse du client devenir un fait **compagnon** de sa fiche (rétractable en cascade),
> et une pièce jointe devenir un **média**. Le routage de faits décide ce rangement pour chaque candidat.
> Le problème résolu : ranger chaque fait au bon endroit, sinon on **fuite** une donnée sensible ou on
> **perd** le lien qui la rend utile.

## Le principe : classer un candidat

À chaque fait candidat, le routeur associe :

- un **type** parmi un petit vocabulaire (par défaut `fact`, `companion`, `vault`, `media`), décision
  **exclusive** ;
- des **drapeaux** indépendants (`cascade`, `closed`, `major`…), décision **multi-étiquettes**.

Le signal d'entrée est le **prédicat** du fait, disponible aussi au moment de l'ingestion, encodé dans la
**représentation directionnelle** de QPath. Un petit réseau directionnel, **entraîné** sur des exemples
étiquetés, en déduit le type et les drapeaux. À l'inférence, c'est **déterministe**, **0 token**, et le nombre
de paramètres reste **fixe**, indépendant de la longueur de l'entrée.

## Router un fait

```ts
import { FactRouter, TextQuatEncoder } from '@damba/libxn-qpath-ml';

const enc = new TextQuatEncoder();                     // texte -> représentation directionnelle
const TYPES = ['fact', 'companion', 'vault', 'media']; // index de classe = position

const router = new FactRouter(TYPES.length, { hidden: 12, numFlags: 3, act: 'identity' });
router.fit(samples, { epochs: 300, lr: 0.01 });        // samples étiquetés : { quats, type, flags }

const r = router.predict(enc.quatsOf('a_image'));
TYPES[r.type];   // -> 'media'
r.flags;         // -> probabilités des drapeaux [cascade, closed, major]
```

- **`predict(quats)`** renvoie `{ type, typeProbs, flags }` ; **`predictType(quats)`** renvoie l'index de type seul.
- **`fit(samples, opts)`** : entraînement par descente de gradient, RNG seedé donc reproductible.
- Le vocabulaire des types et des drapeaux est **libre** : on l'adapte au domaine.

## Sauvegarder et réutiliser le modèle

Un modèle entraîné est un **petit JSON autosuffisant** : on le persiste, puis on le recharge à l'identique.

```ts
const json = router.toJSON();             // poids du routeur
const ready = FactRouter.fromJSON(json);  // mêmes prédictions, prêt à l'inférence
```

À l'ingestion, on l'enchaîne après l'extraction : pour chaque fait candidat, on prédit le type, puis on
écrit via le bon chemin (mémoire normale, compagnon en cascade, coffre, média).

## Routage de faits vs routage d'intention

| | Routage d'intention | Routage de faits |
|---|---|---|
| Question | « que veut l'utilisateur ? » | « comment ranger ce fait ? » |
| Entrée | le message complet | un fait candidat (son prédicat) |
| Sortie | une action (`send_email`, `wallet`…) | un type de rangement (`vault`, `media`…) + drapeaux |
| Place | **entrée** du pipeline (choix de branche) | **après** l'extraction (rangement) |
| Cardinalité | 1 par message | N par message |

> 🔎 **Le contexte tranche le compagnon.** Qu'un fait soit *compagnon* dépend surtout du **contexte
> d'ingestion** (y a-t-il un bloc parent ?), pas du seul prédicat. Le routeur distingue donc le mieux
> `media` et `vault` ; le rattachement compagnon est confirmé par le contexte.

## À quoi ça sert

| Situation | Comment |
|---|---|
| Envoyer une valeur sensible au coffre sans liste de mots-clés | type `vault` appris sur des exemples |
| Reconnaître une pièce jointe comme média | type `media` (prédicat de lien média) |
| Décider la cascade / le verrouillage / le caractère structurant | drapeaux multi-étiquettes |
| Garder une décision **déterministe** et **sans token** à l'ingestion | inférence par le modèle sérialisé |
