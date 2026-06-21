# Prédiction — régression & classification

La même grille qui mémorise des faits sait aussi **prédire**. On l'**entraîne** avec des exemples
(features → cible), et elle **prédit** la valeur ou la classe d'un nouveau cas. Pas de réseau de
neurones classique, pas de dépendance : c'est **déterministe** et **interprétable** (on voit à quelle
profondeur la grille a su répondre).

> 💡 **Comment ça marche, vu de haut.** Chaque exemple encode ses features en un **chemin** dans la
> grille et y dépose sa cible. À la prédiction, on parcourt le chemin du nouveau cas : **plus on
> descend profond, plus la prédiction est spécifique**.

## Entraîner & prédire

```ts
import { XNeuroneGrid, TabularEncoder } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const enc = new TabularEncoder(['surface', 'pieces', 'zone'], 16);

// Régression : apprendre un prix à partir des features.
for (const row of donnees) {
  await grid.train(enc.encode(row), row.prix);
}

// Prédire le prix d'un nouveau bien.
const p = grid.predictNumeric(enc.encode({ surface: 100, pieces: 4, zone: 1 }));
//    → { value: 312000, depth: 7, samples: 14 }
```

- **`train(pairs, target)` → `Promise<void>`** — régression : dépose une **valeur** cible le long du
  chemin et accumule des moyennes sur les nœuds traversés.
- **`predictNumeric(pairs)` → `{ value?, depth, samples }`** — renvoie la moyenne au nœud atteint ;
  `depth` = à quelle profondeur on a pu répondre, `samples` = combien d'exemples l'appuient.

## Classer

```ts
// Classification : apprendre une étiquette.
for (const fleur of iris) {
  await grid.trainClass(enc.encode(fleur), fleur.espece);
}

const c = grid.predictClass(enc.encode(nouvelleFleur));
//    → { label: 'setosa', probability: 0.95, distribution: { setosa: 19, versicolor: 1 }, depth: 6 }
```

- **`trainClass(pairs, label)` → `Promise<void>`** — classification : dépose une **étiquette** et
  compte les classes sur le chemin.
- **`predictClass(pairs)` → `{ label?, probability, distribution, depth, samples }`** — la classe la
  plus probable **et** la distribution complète au nœud atteint.

## Des jeux de données pour démarrer

Deux datasets synthétiques **déterministes** (graine → reproductible) permettent d'essayer tout de suite :

```ts
import { HousingDataset, IrisDataset, Benchmark } from '@damba/libxn';

const maisons = HousingDataset.generate(200, 42);   // { surface, pieces, zone, prix }
const fleurs  = IrisDataset.generate(50, 7);        // { sepal…, petal…, espece }

// Mesurer le noyau (rappel, latence) sur des scénarios de référence.
const bilan = await new Benchmark().runAll();        // { globalRecall, meanLatencyMs, … }
```

- **`HousingDataset.generate(n?, seed?)`** — immobilier synthétique (régression). **`IrisDataset.generate(parClasse?, seed?)`** — 3 espèces en 4 dimensions (classification).
- **`new Benchmark().runAll()`** — harnais autonome : rappel, latence, taille de graphe.

## Cas d'usage

| Situation | Mode |
|---|---|
| Estimer un prix (immobilier, devis) à partir de caractéristiques | **régression** (`train` / `predictNumeric`) |
| Classer (espèce, catégorie, segment client) | **classification** (`trainClass` / `predictClass`) |
| Recommander : plus les features collent, plus la réponse est précise | profondeur (`depth`) de la prédiction |
| Tester / certifier le noyau sans données réelles | `HousingDataset` / `IrisDataset` + `Benchmark` |

> 🔁 **Reproductible.** À graine fixe, datasets **et** prédictions sont rejouables à l'identique —
> indispensable pour comparer et certifier, là où un modèle échantillonné ne l'est pas.
