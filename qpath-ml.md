# Réseaux QPath entraînables — apprendre sur le langage directionnel

À côté de la [prédiction par la grille](/prediction) (déterministe, sans poids), QPath sait aussi
**entraîner** de petits réseaux dont **l'entrée est la représentation directionnelle de QPath**, pas des
flottants bruts. On obtient des classifieurs et régresseurs **compacts**, **reproductibles** (graine
fixe), et dont la taille **ne dépend pas de la longueur** de l'entrée.

> 💡 **L'idée.** On encode une valeur, un enregistrement ou un texte en **entrée directionnelle**, puis on
> entraîne une tête légère par-dessus. Selon la tâche, on choisit un réseau **ordre-invariant** (rapide,
> profil global) ou **ordre-sensible** (lit la séquence). Tout est **déterministe** et **sérialisable**.

## Encoder une entrée

L'encodeur transforme une valeur, un objet ou un texte en entrée directionnelle prête pour les réseaux.
C'est une **boîte noire** : vous lui donnez la donnée, il rend l'entrée.

```ts
import { QuatEncoder, TextQuatEncoder } from '@damba/libxn-qpath-ml';

const enc  = new QuatEncoder({ bits: 8 });          // valeurs & enregistrements
const text = new TextQuatEncoder();                  // texte (insensible à la casse par défaut)

enc.encode({ surface: 120, prix: 30 });              // un enregistrement -> entrée de longueur stable
text.quatsOf('profession');                          // un mot -> entrée (à passer à un réseau)
```

## Classer / régresser — réseau directionnel

`DirectionalNet` apprend une propriété à partir du **profil directionnel** de l'entrée. Sa partie
spécialisée a une **taille fixe**, **quelle que soit la longueur** de l'entrée — idéal pour des entrées de
tailles variées.

```ts
import { QuatEncoder, DirectionalNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const data = rows.map(r => ({ quats: enc.quatsOf(r.valeur), y: [r.label] }));   // label 0/1

const net = new DirectionalNet(8, [{ units: 1, activation: 'sigmoid' }], { act: 'identity' });
net.fit(data, { epochs: 300, lr: 0.1 });

net.predict(enc.quatsOf(nouvelleValeur));            // → [probabilité]
```

## Quand l'ORDRE compte — réseau récurrent

Certaines tâches dépendent de **l'ordre** de la séquence (pas seulement du profil global). `DirectionalRNN`
**lit** l'entrée pas à pas et capte ces dépendances, là où un réseau ordre-invariant plafonnerait.

```ts
import { QuatEncoder, DirectionalRecurrentNet } from '@damba/libxn-qpath-ml';

const enc = new QuatEncoder({ bits: 8 });
const rnn = new DirectionalRecurrentNet(6, [{ units: 1, activation: 'sigmoid' }]);
rnn.fit(data, { epochs: 300, lr: 0.1 });
rnn.predict(enc.quatsOf(x));                          // → [probabilité]
```

> Un MLP profond générique (`MLP`) reste disponible pour des features déjà aplaties — pratique en repère,
> mais le réseau directionnel est le chemin **QPath-natif** (taille fixe, longueur-agnostique).

## Router un fait — `FactRouter`

`FactRouter` classe un **candidat déjà extrait** : son **type** (ex. *fait / compagnon / coffre / média*)
et des **drapeaux** indépendants (ex. *cascade*). Il **ne génère pas** les triplets (ça reste le pipeline
déterministe) ; il **décide** où ranger un candidat. Petit, entraînable, **sérialisable**.

```ts
import { TextQuatEncoder, FactRouter } from '@damba/libxn-qpath-ml';

const enc = new TextQuatEncoder();
const router = new FactRouter(4, { hidden: 10, numFlags: 1 });   // 4 types, 1 drapeau

router.fit(
  exemples.map(e => ({ quats: enc.quatsOf(e.predicat), type: e.type, flags: [e.cascade] })),
  { epochs: 300, lr: 0.05 },
);

router.predict(enc.quatsOf('profession'));
//   → { type: 0, typeProbs: [...], flags: [0.92] }

// Persistance : un petit JSON, rechargé à l'identique.
const json = router.toJSON();
const meme = FactRouter.fromJSON(json);
```

## Les fonctions

- **`QuatEncoder({ bits, mode? })`** — encode une valeur/objet en entrée directionnelle ; `encode`,
  `quatsOf`, `featureSize`. **`TextQuatEncoder({ maxChars? })`** — encode du **texte** (`quatsOf`).
- **`DirectionalNet(H, couches, opts?)`** — réseau ordre-invariant ; `fit(data, { epochs, lr })`,
  `predict(entrée)`. Partie directionnelle de **taille fixe**.
- **`DirectionalRecurrentNet(H, couches, opts?)`** — variante **ordre-sensible** (lit la séquence) ; même
  interface `fit` / `predict`.
- **`MLP(taille, couches, rng?)`** — perceptron multicouche générique (features aplaties).
- **`FactRouter(nbTypes, { hidden, numFlags? })`** — classe un candidat : `predictType`, `predict`
  (`{ type, typeProbs, flags }`), `fit`, **`toJSON` / `fromJSON`**.

## Cas d'usage

| Besoin | Réseau |
|---|---|
| Classer / scorer à partir d'un **profil** d'entrée, longueurs variées | `DirectionalNet` |
| Tâche qui dépend de **l'ordre** de la séquence | `DirectionalRecurrentNet` |
| **Router** un candidat de fait (type + drapeaux) vers le bon anneau | `FactRouter` |
| Repère avec des features déjà aplaties | `MLP` |

> 🔁 **Reproductible & portable.** À graine fixe, l'entraînement est rejouable à l'identique, et un modèle
> tient dans un **petit JSON** (`toJSON`/`fromJSON`) — facile à ranger côté serveur et à recharger.

## Pour aller plus loin

- [Prédiction (grille)](/prediction) — régression / classification **sans poids**, directement sur la grille.
- [Mémoire d'entités](/entity-memory) — similarité & trait manquant, **sans entraînement**.
- [Extraction de faits](/fact-extraction) — d'où viennent les candidats que `FactRouter` classe.
