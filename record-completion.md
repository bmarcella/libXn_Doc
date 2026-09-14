# Proposer les valeurs manquantes

Une fiche arrive incomplète : un courriel sans domaine, un identifiant de badge absent, une ville vide.
Damba **propose une valeur** pour chaque champ vide, avec une **confiance** et une **raison lisible**,
et **s'abstient** quand il n'est pas sûr. Rien n'est écrit sans votre accord.

## D'où vient une proposition

Deux sources, essayées dans cet ordre :

1. **La forme des valeurs.** Beaucoup de champs suivent une forme régulière : un identifiant construit
   à partir d'un autre (`emp:12` donne `badge:emp:12`), un domaine repris d'une société, un fichier
   compilé qui suit son fichier source, un code. Quand plusieurs fiches distinctes attestent la même
   forme, elle est rejouée sur la fiche incomplète.
2. **Les fiches semblables.** Sinon, Damba regarde les fiches qui ressemblent le plus à celle-ci sur
   leurs autres champs, et propose la valeur sur laquelle elles s'accordent.

La confiance combine la proximité des fiches semblables et leur accord (ou la part de fiches qui
attestent la forme). La raison dit, en mots, laquelle des deux sources a parlé.

## Les gardes

- **Jamais contre une valeur décidée.** Une proposition qui contredirait une valeur fermée (décidée) est
  écartée. Un champ déjà rempli n'est de toute façon jamais proposé.
- **Abstention assumée.** Sous le seuil de confiance, le champ reste vide et l'abstention est affichée,
  sans valeur inventée. C'est le cas typique des **mesures numériques bruitées**, où ni une forme ni un
  voisinage ne tranche.
- **Une forme ne s'apprend pas sur des nombres.** Une correspondance « telle mesure donne telle autre »
  apprise sur des valeurs numériques n'est jamais rejouée.
- **La règle la plus spécifique gagne** quand plusieurs formes s'appliquent.
- **Lecture seule.** Le calcul ne modifie pas la mémoire ; appliquer une proposition passe par le chemin
  de modification ordinaire d'une fiche.

## Mesure

Fiches tenues à l'écart, un champ caché par fiche, comparaison avec la valeur la plus fréquente du
champ :

| Jeu | Gain sur la valeur la plus fréquente | Contradictions |
| --- | --- | --- |
| Fiches structurées (clés, domaines, courriels, codes) | **+77 points** | 0 |
| Fiches d'employés (équipe, ville, niveau, badge…) | **+30 points** | 0 |
| Mesures numériques bruitées | aucun gain : Damba s'abstient au lieu d'inventer | 0 |

## Dans l'application

Dans l'onglet Fiches, vues Cartes et Tableau, le bouton **« Proposer les valeurs manquantes »** affiche pour chaque
champ vide la valeur, sa confiance et sa raison, avec **Appliquer**, ou l'abstention.

## Utilisation dans le code

```ts
import { Recombiner, makeRng } from '@damba/libxn-generative';

const rec = new Recombiner(kb, makeRng(42));
const proposals = rec.proposeMissing(
  'emp:12',
  [{ p: 'team', o: 'data' }],
  ['team', 'city', 'badge'],
);
// Map par champ : { kind: 'proposal', value, confidence, … } ou une abstention motivée.
// Un champ déjà renseigné n'apparaît pas.
```

## Autocomplétion de la mémoire

Même esprit, dans le chat : en tapant, Damba **complète les sujets qu'il connaît déjà** (une personne,
un client, une fiche) sous la zone de saisie. Il ne propose que des sujets **présents en mémoire**,
jamais un nom inventé. L'apprentissage des complétions se fait en arrière-plan sans ralentir la saisie.

## Où ça s'inscrit

C'est une des formes de la [déduction générative](/generative-deduction) : produire du structuré,
vérifié, et se taire plutôt que deviner. Voir aussi la [synthèse de flux](/flow-synthesis).
