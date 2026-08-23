# Compétences — un savoir-faire qui s'installe, et qui se vérifie

Une consigne dans un prompt dit au modèle comment travailler. Elle s'oublie, elle ne se scope pas,
elle ne se désinstalle pas, et surtout **rien ne vérifie qu'elle a été suivie**. Une **compétence**
Damba est la même connaissance, mais posée en **faits installables** — et doublée d'un **contrôle**
qui relit le résultat.

> 💡 **Le principe.** *Un fichier de consignes dit au modèle ; Damba vérifie le modèle.* Ce qui est
> testable sort du prompt et entre dans le contrôle. Une consigne s'oublie ; un test échoue.

> 🎯 **Cas d'usage.** « Voici comment on écrit une interface ici. » Le savoir-faire s'installe comme
> un paquet, s'active par compte, entre dans le prompt au bon moment, et ce qui en sort est relu.
> Une violation ne dit pas « erreur 4021 » : elle **cite la règle installée** qui a été enfreinte.

## Trois fidélités, parce que tout ne se met pas en triplets

Un savoir-faire n'est pas homogène, et le forcer dans un seul format serait une faute. Une
compétence se range donc en trois catégories, et c'est la catégorie qui décide du traitement :

| Nature | Exemple | Devient |
| --- | --- | --- |
| **Règle décidable** | une classe assemblée à l'exécution n'existe nulle part | un contrôle exécutable |
| **Interdit** | pas de pictogramme décoratif en guise d'icône | un fait négatif |
| **Goût** | garder une palette sobre | de la prose, retrouvée au moment utile |

Seule la première catégorie peut faire refuser quoi que ce soit. Les deux autres informent, elles ne
jugent pas — et cette frontière est tenue par la donnée, pas par le code.

## Ce qui est installé décide ; le moteur n'a pas d'avis

C'est la propriété qui sépare une compétence d'un contrôle figé dans le produit : **la sévérité vit
dans le pack**, pas dans le moteur.

Le même texte, deux compétences installées, deux verdicts — refus sous l'une, simple signalement
sous l'autre, sans qu'une ligne du moteur ne change. Et **retirer la compétence retire le contrôle** :
il n'y a rien d'autre à désactiver.

## La porte : ce qui distingue une compétence d'une consigne

Après la génération, le contrôle relit. Trois comportements, dans cet ordre :

1. **Il cite le fait enfreint**, jamais seulement un code interne. On remonte du refus à la ligne
   qu'on a installée, on la lit, et on la retire si on n'en veut pas. C'est le point d'auditabilité,
   et c'est ce qu'aucun outil de vérification classique n'offre.
2. **Il décide selon la sévérité installée** : refus pour ce qui est sûr, avertissement pour ce qui
   est indicatif. Dans le doute, il avertit — il ne refuse jamais.
3. **Il propose une correction, et seulement quand il peut la garantir.** La correction est relue par
   le contrôle **avant** d'être proposée. Quand elle n'est pas sûre, rien n'est proposé et c'est dit.
   Une correction fautive coûterait plus cher que pas de correction du tout.

## Mesuré, pas affirmé

Chaque étape de cette capacité a dû franchir un critère chiffré, et deux d'entre elles ont été
recalibrées par la mesure plutôt que par l'intuition.

**L'injection sert, et on sait de combien.** Sur un jeu de demandes de génération construites pour
provoquer la faute, la compétence installée fait passer le taux de réponses fautives de **80 % à
50 %** — cinq demandes améliorées sur six, aucune dégradée, et un écart qui se distingue du hasard
par deux lectures statistiques indépendantes.

**Les 50 % qui restent sont la raison d'être du contrôle.** Une consigne suivie une fois sur deux
n'est pas un demi-succès : c'est la démonstration que la consigne seule ne suffit pas. Repassées au
contrôle, les réponses fautives sont toutes refusées, et chacune reçoit une correction vérifiée.

**Une règle annoncée « vérifiable » ne l'est pas forcément.** La mesure en a invalidé deux avant
qu'elles ne coûtent quoi que ce soit : l'une était plus large que la réalité et signalait du code
parfaitement correct, l'autre demandait une analyse grammaticale qu'un contrôle par motifs ne sait
pas faire. Elles restent vraies et nommées, mais elles ont rejoint la prose. **On ne sait pas
d'avance ce qui est décidable ; on le mesure.**

## Ce que la porte ne dit pas

À tenir avec la même fermeté que le reste : le contrôle ne rattrape **que ce qu'on a su nommer**. Un
code qui passe n'est pas un code juste — il est seulement exempt des fautes qui ont une règle. Le
contrôle ne juge ni le goût, ni l'architecture, ni la pertinence.

## Voir aussi

- [Types de faits](/fact-types) — les drapeaux et la provenance sur lesquels une compétence repose
- [Faits compagnons](/companion-facts) — le regroupement qui fait d'un pack une unité installable
- [Factflow](/dynamic-behavior) — les compétences d'**action** : une procédure, et non un savoir-faire
- [Cycle de vie du prompt](/prompt-lifecycle) — où une compétence entre dans la conversation
