// Exemple 1 — base de connaissances : stocker des faits, interroger, transitivité.
//
// Exécution (une fois vitest/ts-node configuré dans packages/libxn) :
//   les imports passent par l'alias @damba/libxn dans ce dépôt.

import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

async function main() {
  const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

  await kb.tell('socrate', 'est', 'humain');
  await kb.tell('humain', 'est', 'mortel');
  await kb.tell('chat', 'aime', 'poisson');

  console.log(kb.ask('socrate', 'est'));   // ['humain', 'mortel' via transitivité]
  console.log(kb.ask('chat', 'aime'));     // ['poisson']
  console.log(kb.askInverse('aime', 'poisson')); // ['chat']
}

main();
