// Exemple 3 — raisonnement par chaînage arrière (ChainResolver + PredicateAlgebra).
//
// "socrate est humain", "humain est mortel", "mortel a une fin" ⇒ "socrate a une fin".

import { XNeuroneGrid, KnowledgeBase, ChainResolver } from '@damba/libxn';

async function main() {
  const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

  await kb.tell('socrate', 'est', 'humain');
  await kb.tell('humain', 'est', 'mortel');
  await kb.tell('mortel', 'a', 'fin');

  const resolver = new ChainResolver(kb);

  const chain = resolver.chain('socrate', 'a');
  console.log(chain ? ChainResolver.format(chain) : 'aucune chaîne');
  // → socrate —est→ humain —est→ mortel —a→ fin  (⇒ a = fin, confiance 1.00, via transitive)

  console.log(resolver.verifyChain('socrate', 'a', 'fin')); // true
}

main();
