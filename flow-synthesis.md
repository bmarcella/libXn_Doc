# Synthèse de flux

Décrire une automatisation en une phrase, et recevoir un [flux](/dynamic-behavior) déjà vérifié :

> « Quand un devis arrive, si le montant dépasse 1 000, envoie un courriel au responsable, sinon
> enregistre le devis. »

Damba compose le flux à partir de **briques éprouvées**, le **vérifie**, puis le propose. Aucun modèle
de langue n'intervient tant que la demande entre dans ce que les briques savent faire. Quand elle en
sort, l'IA prend le relais, et sa proposition passe par les mêmes contrôles.

## Comment ça marche, vu de l'extérieur

1. **La phrase devient un but** : déclencheur, conditions, actions de la branche « alors » et de la
   branche « sinon », boucle, politique d'échec. Le lecteur est volontairement fermé : une clause qu'il
   ne reconnaît pas le fait renoncer plutôt que deviner.
2. **Les briques se composent.** Plusieurs assemblages sont essayés, du plus simple au plus coûteux,
   dans un budget borné.
3. **Chaque candidat est vérifié** deux fois : par le validateur de flux (lien mort, boucle non bornée,
   outil interdit, condition incomplète), puis par une **exécution simulée** sur des cas tirés du but
   lui-même (condition vraie, chaque condition fausse, outil qui tombe en panne). Aucun outil réel n'est
   appelé pendant la vérification. Un candidat n'est retenu que si, dans chaque cas, il appelle
   **exactement** les actions attendues, dans l'ordre.
4. **Le premier candidat accepté est proposé**, avec les candidats refusés et leur raison. Rien n'est
   activé sans vous : le flux arrive en surcouche de développement, comme tout flux proposé.

Si aucun candidat ne passe, la demande est dite **inatteignable avec ces briques**, et c'est à ce moment
que l'IA est sollicitée.

## Ce que les briques couvrent

| Besoin | Exemple de tournure |
| --- | --- |
| Déclencheur | réception d'un formulaire, arrivée ou changement d'un fait, planifié, manuel |
| Conditions | comparaisons numériques et textuelles, appartenance, valeur non vide, conjonctions |
| Deux branches | « si … alors … sinon … » |
| Boucle bornée | « pour chaque client, au plus 20 » |
| Appel d'un autre flux | « appelle le flux relance » |
| Chaînage de résultat | réutiliser la sortie de l'action précédente |
| Minuteurs | « dans 3 jours », « tous les 7 jours au plus 4 fois » |
| Attente d'une réponse humaine | « demande … à … et à la réponse … » |
| Politiques d'échec | « avec réessai », continuer ou s'arrêter en cas d'échec |

Un but contradictoire, un outil interdit dans l'environnement ou une phrase ambiguë ne produisent
**aucun flux** : ils produisent une raison.

## Mesure

Sur **123 flux écrits avant cet outil** (exemples du noyau, flux des bancs de test, flux des guides), on
a extrait le but de chacun et demandé à la synthèse de le reconstruire avec les vrais outils :

| Mesure | Résultat |
| --- | --- |
| Flux recomposés | **64 %** |
| Flux recomposés dont l'équivalence est prouvée par exécution | **50** |
| Flux faux proposés | **0** |

Le reste se répartit entre des constructions encore hors des briques et des flux d'origine que le
validateur refuse lui-même. Chaque ajout de briques a été remesuré sur le même corpus, avec zéro faux
positif à chaque palier. Sur le banc de buts écrits à la main, la recherche juge en général un seul
candidat et répond en quelques millisecondes, de façon déterministe.

## Dans le chat

« Crée un flux qui… » tente d'abord la synthèse. Quand les briques ne suffisent pas, l'IA prend le
relais et propose le flux. L'aperçu dit d'où vient le flux : **« Composé et vérifié par Damba »**,
avec le nombre de cas sur lesquels il a été vérifié, ou **« Proposé par l'IA »**, à relire. Dans les deux cas, le flux proposé passe par le validateur et attend votre
accord avant d'être écrit.

## Utilisation dans le code

```ts
import { parseGoalSentence, synthesizeFlow } from '@damba/libxn';

const goal = parseGoalSentence(
  'quand un devis est reçu, si le montant > 1000, alors envoie un courriel, sinon enregistre',
  { name: 'devis' },
);
if (goal) {
  const r = await synthesizeFlow(goal, { tools, allowedTools });
  if (r.accepted) {
    // r.accepted.facts : les faits du flux, prêts à écrire en surcouche de développement
  } else {
    // r.rejectedGoal ou r.refused[].reason : pourquoi ; c'est ici que l'IA reprend la main
  }
}
```

`tools` est votre registre d'outils, `allowedTools` la liste permise dans l'environnement. Un `null` en
sortie du lecteur signifie « phrase non reconnue » : ne rien inventer, passer à l'IA.

## Où ça s'inscrit

C'est l'application la plus directe de la [déduction générative](/generative-deduction) : ce que Damba
génère nativement, ce sont des **artefacts structurés prouvés**. Voir aussi
[Proposer les valeurs manquantes](/record-completion).
