# Synonymes de prédicats — un vocabulaire qui s'apprend tout seul

Deux personnes disent « **réside** à Lyon », « **vit** à Lyon », « **habite** Lyon » : c'est la **même
relation**. Sans aide, QPath enregistre trois prédicats différents → mémoire fragmentée, questions sans
réponse (« où vit Marie ? » ne retrouve pas un fait stocké sous « habite »). Le **vocabulaire de
prédicats** unifie les synonymes vers une **forme canonique**. Il **part riche** (seed), **grossit tout
seul** (proposeur par l'usage), et **lit avec tolérance**.

> 💡 **L'idée.** Un synonyme est un **fait** comme un autre : `(réside, predicate_alias, habite)`. On les
> **sème** en lot, le système en **propose** de nouveaux à partir de vos données, vous **confirmez** d'un
> clic. Aucune table à maintenir à la main, et tout est **déterministe** (0 token).

## 1. Semer le vocabulaire — partir riche, pas vide

Le seed FR intégré couvre les prédicats de relation courants. On l'écrit **une fois** en faits persistés ;
`PredicateVocabulary.fromKb` les rechargera à chaque démarrage.

```ts
import { seedPredicateAliasFacts, FR_PREDICATE_SYNONYMS, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

const n = await seedPredicateAliasFacts(kb, FR_PREDICATE_SYNONYMS);
//   → écrit ~80 faits (réside→habite, bosse→travaille, adore→aime, …) ; n = nombre écrit
```

Votre propre dictionnaire (export CRISCO, Wiktionnaire…) se charge **sans code**, au même format texte
`canonique: syn1, syn2` (`#` = commentaire) :

```ts
await seedPredicateAliasFacts(kb, `
# canonique: synonymes
dirige: gère, pilote, mène, commande
soigne: traite, guérit, ausculte
`);
```

## 2. Canonicaliser à l'extraction

Une fois semé, l'extraction unifie les synonymes vers la canonique. Le `PredicateVocabulary` se branche
sur le pipeline ; `canonicalPredicate` couvre les cas que le LLM produit en désordre.

```ts
import { seedPredicateVocabulary, canonicalPredicate, runFactPipeline, FR_PREDICATE_SYNONYMS } from '@damba/libxn';

const vocab = seedPredicateVocabulary(FR_PREDICATE_SYNONYMS);

canonicalPredicate(vocab, 'réside');   // → 'habite'
canonicalPredicate(vocab, 'bosse');    // → 'travaille'

// Dans le pipeline d'extraction : les triplets sortent déjà canonicalisés.
const { facts } = runFactPipeline(candidates, { kb, vocabulary: vocab });
//   « Marie réside à Lyon »  →  (marie, habite, lyon)
```

## 3. Lire avec tolérance

Le pendant lecture : une question posée avec un synonyme retrouve un fait stocké sous un autre, **sans
avoir réécrit le fait**.

```ts
import { askTolerant, PredicateVocabulary } from '@damba/libxn';

await kb.tell('marie', 'habite', 'lyon');

const vocab = PredicateVocabulary.fromKb(kb);
askTolerant(kb, 'marie', 'vit', { vocabulary: vocab });
//   → { objects: ['lyon'], matched: 'habite', tried: ['vit', 'habite', 'réside', …] }
```

## 4. Proposer depuis l'usage — l'auto-croissance

Le seed ne connaît que ce qu'on lui donne. Le **proposeur** déduit de **nouveaux** synonymes à partir de
**vos faits** : deux prédicats se ressemblent s'ils relient les mêmes `(sujet, objet)`, surtout le même
**vocabulaire d'objets**. « surveille » et « garde » prennent tous deux des lieux → proposés ; « aime »
prend des boissons → **non** proposé synonyme de « habite ».

```ts
import { proposeSynonyms, seedPredicateAliasFacts } from '@damba/libxn';

// Vos faits, accumulés naturellement :
await kb.tell('jean', 'surveille', 'lyon');   await kb.tell('marie', 'surveille', 'paris');
await kb.tell('jean', 'garde', 'lyon');       await kb.tell('anne', 'garde', 'paris');

const props = proposeSynonyms(kb, { minScore: 0.3 });
//   → [{ canonical: 'surveille', synonym: 'garde', score: 1, sharedObjects: ['lyon', 'paris'], agreements: 1 }]
//     (canonique = le prédicat le plus fréquent ; ne modifie RIEN)

// L'humain confirme -> on grave le synonyme (la base grossit toute seule) :
if (props.length) {
  const p = props[0];
  await seedPredicateAliasFacts(kb, [{ canonical: p.canonical, synonyms: [p.synonym] }]);
}
```

La boucle complète : **propose** (par l'usage) → **confirme** (un clic) → **écrit** (`predicate_alias`) →
**filtré** des propositions suivantes. Le vocabulaire s'enrichit de vos vraies données, pas d'un dico
générique.

## 5. Détacher la préposition collée

L'extraction colle parfois la préposition au prédicat (« réside**_à** », « travaille**_a** »).
`canonicalPredicate` essaie le prédicat tel quel, **puis** sans sa préposition finale.

```ts
import { canonicalPredicate, stripPredicatePreposition } from '@damba/libxn';

stripPredicatePreposition('réside_à');     // → 'réside'
canonicalPredicate(vocab, 'réside_à');     // → 'habite'        (synonyme + préposition)
canonicalPredicate(vocab, 'travaille_a');  // → 'travaille'     (unifie verbe_prép et verbe)
```

## Les fonctions

- **`seedPredicateVocabulary(input, vocab?)` → `PredicateVocabulary`** — construit (ou complète) un
  vocabulaire **en mémoire** depuis un texte `canonique: syn1, syn2` ou des groupes.
- **`seedPredicateAliasFacts(kb, input)` → `Promise<number>`** — écrit les synonymes en **faits**
  `(synonyme, predicate_alias, canonique)` (**persistés**, rechargés par `PredicateVocabulary.fromKb`).
- **`parseSynonyms(text)` → `SynonymGroup[]`** — parse le format texte (`#` = commentaire ; sans
  deux-points, le 1ᵉʳ mot est la canonique).
- **`proposeSynonyms(kb, opts?)` → `SynonymProposal[]`** — **propose** des synonymes déduits de l'usage
  (par recouvrement du vocabulaire d'objets). Trié par score, **ne modifie rien**. À confirmer par l'humain.
- **`canonicalPredicate(vocab, p)` → `string`** — canonicalisation **tolérante** : prédicat tel quel, puis
  sans sa préposition finale. **`stripPredicatePreposition(p)`** détache juste la préposition.
- **`askTolerant(kb, s, p, { vocabulary })` → `{ objects, matched, tried }`** — lecture qui essaie tous
  les prédicats équivalents jusqu'à un fait trouvé.
- **`FR_PREDICATE_SYNONYMS`** — seed FR de départ (prédicats de relation courants).

## Cas d'usage

- **Assistant de chat** — l'utilisateur affirme « Paul bosse à l'hôpital », interroge « où travaille
  Paul ? » : les deux se rencontrent via la canonique `travaille`, **sans** que l'utilisateur connaisse le
  prédicat exact.
- **Ingestion de documents** — un rapport emploie « réside », un autre « domicilié à », un troisième
  « habite » : tous convergent vers `habite`, donc une **seule** entrée interrogeable par entité.
- **Montée en charge** — au lieu d'écrire une table de synonymes à la main, on **sème** un dictionnaire et
  on laisse le **proposeur** suggérer le reste depuis le corpus réel.
- **Multilingue** — la synonymie est portée par des **faits** (`predicate_alias`), scopés par anneau comme
  le reste : un pack par langue, sans toucher au code.

> ⚠️ La synonymie est **scopée aux prédicats de relation** (peu ambigus). On évite volontairement la
> synonymie de **tous** les mots (« voler » = dérober **ou** s'envoler) pour ne pas sur-fusionner.

## Pour aller plus loin

- [Extraction de faits](/fact-extraction) — la chaîne texte → triplets où se branche le vocabulaire.
- [Hygiène des faits](/fact-maintenance) — GC & Ajuster, l'autre versant de la qualité.
- [Types de faits](/fact-types) — les drapeaux, `predicate_alias` et les autres méta-faits.
