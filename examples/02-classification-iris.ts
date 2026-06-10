// Exemple 2 — classification : entraîner le graphe sur un dataset tabulaire, prédire une classe.
//
// Montre train/predictClass + un encodeur tabulaire (largeur fixe par feature).

import { XNeuroneGrid, TabularEncoder } from '@damba/libxn';

async function main() {
  // L'ordre des features doit être stable entre entraînement et prédiction.
  const features = ['sepalLength', 'sepalWidth', 'petalLength', 'petalWidth'];
  const encode = (row: Record<string, number>) => TabularEncoder.encode(row, features);

  const grid = new XNeuroneGrid(undefined, { headless: true });

  // Quelques échantillons (label = espèce).
  const samples: Array<[Record<string, number>, string]> = [
    [{ sepalLength: 5.1, sepalWidth: 3.5, petalLength: 1.4, petalWidth: 0.2 }, 'setosa'],
    [{ sepalLength: 7.0, sepalWidth: 3.2, petalLength: 4.7, petalWidth: 1.4 }, 'versicolor'],
    [{ sepalLength: 6.3, sepalWidth: 3.3, petalLength: 6.0, petalWidth: 2.5 }, 'virginica'],
  ];

  for (const [row, label] of samples) {
    await grid.trainClass(encode(row), label);
  }

  const query = { sepalLength: 5.0, sepalWidth: 3.4, petalLength: 1.5, petalWidth: 0.2 };
  const pred = grid.predictClass(encode(query));
  console.log(pred.label, pred.probability, pred.distribution);
}

main();
