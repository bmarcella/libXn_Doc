# Mémoire qui apprend — nap-grid

À côté de la [prédiction par la grille](/prediction) (déterministe, sans poids) et des
[réseaux QPath entraînables](/qpath-ml) (un réseau nourri par un encodage), **nap-grid** est une troisième
voie : **le graphe qui grandit EST le réseau**. La mémoire s'agrandit à mesure que la donnée arrive, et
elle **apprend en même temps ce qui compte**.

> 💡 **L'idée.** La grille pure retient tout à poids égal : elle ne sait pas qu'une feature compte plus
> qu'une autre, et sur une combinaison jamais vue elle ne peut que retomber. nap-grid ajoute des poids
> appris **sur le graphe lui-même** : il **généralise** à des entrées qu'il n'a jamais stockées, tout en
> restant **déterministe** (graine fixe) et **auditable** (on lit quel chemin a pesé, et de combien).

## Ce que ça débloque

| Capacité | Grille seule | nap-grid |
|---|---|---|
| Importance des features | tout à poids égal | apprend et **montre** quel chemin pèse |
| Combinaison de features **jamais vue** | retombe / échoue | **interpole** grâce aux poids partagés |
| Apprentissage **en ligne** | grandit sans apprendre | grandit **et** s'ajuste, à chaque exemple |
| Confiance | comptée (fréquence) | portée par la profondeur mémorisée |

nap-grid n'est **pas** un LLM : zéro token, déterministe, et chaque prédiction porte sa justification.

## Utilisation

L'entrée est encodée en **directions QPath** (comme partout dans la lib), puis on entraîne en ligne et on
prédit avec un audit intégré.

```ts
import { NapGrid, encodeFeatures } from '@damba/libxn-nap-grid';

const nap = new NapGrid({ seed: 1 });                       // défaut robuste

// Apprentissage en ligne : chaque ligne fait grandir le graphe ET ajuste les poids.
nap.train(
  rows.map(r => ({ dirs: encodeFeatures([r.surface, r.distance]), target: r.prix / echelle })),
  { epochs: 2000, lrDecay: 0.9997 },
);

// Prédiction AUDITABLE : la valeur + le chemin qui l'a produite.
const p = nap.predict(encodeFeatures([surface, distance]));
//   → { value, depthReached, contributions: [{ depth, dir, shared, local, gate }, …] }
```

`depthReached` dit **quelle part** de l'entrée était réellement en mémoire (le reste est comblé par
généralisation) ; `contributions` détaille **le poids de chaque pas** — c'est la prédiction explicable.

## Dans QPath — prédiction numérique auditable

Le service `NapGridService` entraîne un modèle sur des lignes tabulaires et répond avec une
**justification** (quelles features ont pesé), en 0 token.

```ts
napGrid.train(logements, 'prix', { epochs: 2000 });

napGrid.predict({ surface: 80, distance: 3 });
//   → { value: 210_000, confidence: 0.75,
//       because: [ { feature: 'surface', contribution: 190_000 },
//                  { feature: 'distance', contribution:  12_000 } ] }
```

QPath peut ainsi répondre « ~210 000, surtout à cause de la surface » **et le justifier par le chemin**,
sans appeler de modèle de langage.

## Entraîner sur les faits de la mémoire

Plutôt qu'un dataset externe, nap-grid s'entraîne directement sur les **faits `(sujet, prédicat, objet)`
numériques** déjà en mémoire : on groupe par **sujet** (chaque entité = une ligne), les prédicats
numériques deviennent des **features**, un prédicat choisi devient la **cible**. Les faits texte sont
ignorés, un prédicat manquant est imputé par sa moyenne, et les grandes valeurs (salaires, prix) sont
mises à l'échelle automatiquement.

```ts
import { factsToRows, TabularModel } from '@damba/libxn-nap-grid';

// Faits en mémoire : (alice, anciennete, 5) (alice, equipe, 3) (alice, salaire, 61000) (alice, nom, "Alice")…
const { rows, features } = factsToRows(facts, 'salaire');
//   rows = [{ anciennete: 5, equipe: 3, salaire: 61000 }, …]   features = ['anciennete', 'equipe']

const model = new TabularModel({ seed: 1 });
model.fit(rows, 'salaire', { epochs: 2000 });

model.predict({ anciennete: 10, equipe: 3 });
//   → { value: ~78000, confidence, because: [ { feature: 'anciennete', … }, … ] }
```

> Résultat mesuré sur une mémoire d'employés bruitée : l'estimation tombe à ≈ 2 400 € d'erreur contre
> ≈ 16 700 € pour la simple moyenne (≈ 7× mieux), proche du plancher de bruit. Le tout **déterministe**
> et **auditable** (on lit quel prédicat a pesé).

## Classer une catégorie (classification)

nap-grid ne fait pas que des nombres : il prédit aussi une **catégorie** (l'espèce d'une fleur, un statut,
un type). Le principe reste le même — features numériques, cible catégorielle — mais on entraîne **un
réseau par classe** (« est-ce cette catégorie ? »), puis on prend le plus confiant.

```ts
import { factsToLabeledRows, TabularClassifier } from '@damba/libxn-nap-grid';

// Faits : (iris_3, petalLength, 54) (iris_3, sepalLength, 65) … (iris_3, species, 'virginica')
const { rows, labels } = factsToLabeledRows(facts, 'species');   // labels = ['setosa','versicolor','virginica']

const clf = new TabularClassifier({ seed: 1 });
clf.fit(rows, { epochs: 1500 });

clf.predict({ sepalLength: 50, sepalWidth: 34, petalLength: 15, petalWidth: 2 });
//   → { label: 'setosa',
//       scores: [ { label: 'setosa', prob: 0.56 }, … ],   // probabilités par classe (somme = 1)
//       because: [ { feature: 'petalLength', … }, … ] }   // audit par feature
```

> Résultat mesuré sur Iris : **≈ 88 % de bonnes réponses** sur des fleurs jamais vues (le hasard à 3
> classes = 33 %). Déterministe, et la réponse dit **pourquoi** (quelle mesure a tranché).

## Les fonctions

- **`NapGrid(options?)`** — la mémoire qui apprend. `train(samples, { epochs, lrDecay })` (apprentissage
  en ligne), `observe(dirs, target)` (un pas), `predict(dirs)` (valeur **+ audit**), `value(dirs)` (valeur
  seule). Options : `seed`, `learningRate`, et les boutons du mélange généralisation / mémorisation.
- **`StatGrid`** — la grille statistique pure, fournie comme **témoin** de comparaison.
- **`encodeNumber(v, bits?)` / `encodeFeatures(values, bits?)`** — encodent une valeur ou un vecteur de
  features en directions QPath.
- **`factsToRows(facts, target)`** / **`TabularModel`** — RÉGRESSION : assemble des lignes numériques
  depuis les faits, `fit` / `predict` (valeur + `because`), mise à l'échelle automatique.
- **`factsToLabeledRows(facts, target)`** / **`TabularClassifier`** — CLASSIFICATION : cible
  catégorielle, `fit` / `predict` (label + probabilités par classe + `because`).

> 🔁 **Déterministe & portable.** À graine fixe, l'entraînement est rejouable à l'identique.

## Comment le tester

Le paquet est **entièrement testé**, dont un **balayage exhaustif de 10 000 cas** (toute la grille
`(A,B)` à la résolution 100×100) qui vérifie les invariants sur chaque entrée : prédiction finie,
audit complet, bornes de la mémoire, et déterminisme sur toute la matrice de réglages.

```bash
cd packages/libxn-nap-grid
npm install
npm test        # suite complète, dont les 10 000 cas exhaustifs
npm run bench   # tableau comparatif : grille statistique vs nap-grid, sur des entrées jamais vues
```

## Pour aller plus loin

- [Prédiction (grille)](/prediction) — régression / classification **sans poids**, sur la grille.
- [Réseaux QPath (ML)](/qpath-ml) — un réseau **séparé** nourri par l'encodage QPath (à ne pas confondre).
- [Mémoire d'entités](/entity-memory) — similarité et trait manquant, **sans entraînement**.
