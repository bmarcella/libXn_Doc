# L'organe verbal — la voix de la mémoire

La [Réalisation](/realization) a donné à QPath une première voix : mettre un fait en phrase. L'**organe
verbal** va au bout de cette idée : **une seule voix** pour toutes les réponses déterministes, une
couverture large des relations, des phrases qui s'enchaînent en **paragraphes** et en **démonstrations**,
et des organes qui **apprennent en lisant** (le genre des mots, la forme des phrases). Toujours la même
règle : **mieux dire ce que la mémoire sait**, jamais générer au hasard.

> 💡 **Le principe.** Chaque manque de langue devient un **organe séparé et appris** : le sens, la
> grammaire, la morphologie et l'identité ne se mélangent pas. Chaque organe est déterministe,
> auditable, et s'améliore simplement en **lisant** — pas d'entraînement opaque, pas d'invention.

> 🎯 **Cas d'usage.** Un assistant qui répond par de vraies phrases (« Marie n'habite pas à Paris »,
> « Rex aime la musique »), décrit une entité en paragraphe fluide, et **démontre** ses déductions en
> français (« Rex est un chien, or un chien est un mammifère, donc Rex est un mammifère. ») — le tout
> en 0 token, chaque mot traçable à un fait.

## Une seule voix

Tous les chemins de réponse déterministes passent par la **même Réalisation** : les faits directs, les
listes (« Marie, Pierre et Jean »), les déductions, les prédictions. Fini les trois voix incohérentes
(une phrase soignée ici, un triplet brut là) : la forme est produite au même endroit, avec les mêmes
garanties, et la commande « dis-le autrement » fonctionne partout.

## Une couverture large, jugée par l'aller-retour

La voix de chaque **relation** (composition, cause, comparaison, possession, capitale, synonymie…) est
déclarée **à côté de la relation elle-même**, dans l'inventaire — une seule source de vérité, ~50
relations couvertes :

| Fait stocké | Phrase produite |
| --- | --- |
| `(table, fait_de, bois)` | **Table se compose de bois.** |
| `(paris, capitale_de, france)` | **Paris est la capitale de France.** |
| `(fumer, cause, cancer)` | **Fumer provoque cancer.** |
| `(marie, not_habite, paris)` | **Marie n'habite pas à Paris.** |
| `(rex, aime, musique)` — genre appris | **Rex aime la musique.** |
| `(pierre, vient_de, italie)` | **Pierre vient d'Italie.** |

Chaque formulation est **relisible par construction** : la phrase produite, relue par le lecteur,
retombe sur la même relation canonique — un test systématique le verrouille pour toutes les relations.
La **négation** est propre (« ne … pas », élision « n' »), et l'**article d'objet** apparaît dès que le
genre du mot est connu — appris, jamais deviné.

## Des organes qui apprennent en lisant

Le paquet `@damba/libxn-language` héberge les organes **appris** :

- **Morphologie** — le genre et le nombre des noms se déduisent du **contexte de lecture** (« la
  table » lue une fois suffit à savoir que table est féminin), avec une graine minimale (le/la) et un
  repli sur la forme du mot. Plus l'assistant lit, plus ses articles et ses pronoms sont justes.
- **Juge de grammaire** — des **classes de mots** s'induisent toutes seules des textes lus (les
  déterminants se regroupent, les noms se regroupent…), et un modèle de **séquence de classes** note la
  forme d'une phrase. Jamais un modèle de mots : le juge note une **structure**, il ne génère rien.

```ts
import { MorphLexicon, GrammarJudge } from '@damba/libxn-language';

const morph = new MorphLexicon();
morph.observeText('La ville est belle. Le chien dort.');
morph.genderOf('ville');   // 'f' — appris en lisant

const judge = new GrammarJudge();
judge.observeText(bibliothèque);          // nourrir en lisant
judge.score('Marie vit à Paris');         // note de forme (null s'il n'a pas assez lu)
```

Le juge **s'abstient** tant qu'il n'a pas assez lu : pas de verdict sur du bruit.

## La prose de raisonnement

Une déduction ne se contente plus d'énoncer sa conclusion : elle se **démontre** en français.

```
Rex est un chien, or un chien est un mammifère, donc Rex est un mammifère.
```

Chaque proposition est un **fait stocké**, chaque « or »/« donc » une **inférence traçable** : c'est la
mémoire auditable qui parle. La trace technique (étapes, confiance) reste disponible à côté ; la prose
est la réponse.

```ts
import { realizeChainProse } from '@damba/libxn';

realizeChainProse({
  steps: [{ s: 'rex', p: 'est', o: 'chien' }, { s: 'chien', p: 'est', o: 'mammifère' }],
  conclusion: { s: 'rex', p: 'est', o: 'mammifère' },
});
// → « Rex est un chien, or un chien est un mammifère, donc Rex est un mammifère. »
```

## Le discours : décrire en paragraphe

Décrire une entité n'est plus une liste de phrases juxtaposées : l'**ossature** d'abord (ce que la
chose *est*), puis les faits regroupés par famille, un **pronom de reprise** quand le genre est connu
(jamais deviné), des propositions liées par « et »/« aussi », et des formulations **variées** — toutes
attestées, donc toutes vraies.

```ts
import { realizeDescription } from '@damba/libxn';

realizeDescription('Rex', [
  { p: 'est_un', objs: ['chat'] },
  { p: 'est', objs: ['noir'] },
  { p: 'habite', objs: ['paris'] },
], { subjectGender: 'm' });
// → « Rex est un chat. Il est noir et il habite à Paris. »
```

## Le juge interne : choisir la mieux dite

Un même fait se dit de plusieurs façons **toutes vraies** (« habite / vit / réside à Paris »). Le juge
de grammaire les **range de la mieux formée à la moins bien formée** : la voix sert d'abord la
meilleure, et « dis-le autrement » descend le classement au lieu de tourner à l'aveugle.

```ts
import { recombineFact } from '@damba/libxn';

recombineFact({ s: 'marie', p: 'habite', o: 'paris' }, { typer, score: (t) => judge.score(t) });
// → variantes rangées par le juge — la mieux dite en tête, toutes vraies
```

> ⚖️ **Pourquoi c'est sûr.** Le juge ne **choisit** qu'entre des candidats déjà certifiés vrais par
> l'aller-retour. Mal noter ne peut pas faire mentir — au pire, la phrase est moins élégante.

## Garanties

| Garantie | Comment |
| --- | --- |
| 0 token | Tout est règles + comptes appris en lisant ; aucun appel à un modèle externe |
| 0 invention | Chaque phrase se relit aux faits qui l'ont produite (aller-retour) |
| Déterministe | Mêmes faits + mêmes lectures → même voix, reproductible |
| Abstention | Genre inconnu → pas de pronom ; juge pas assez nourri → ordre canonique |
