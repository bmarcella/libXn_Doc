# Expertise — un savoir qui se nomme, s'examine et se transporte

Une **compétence** dit comment travailler. Une **expertise** dit ce qu'on sait d'un domaine. C'est
un objet nommé, bâti à partir de documents, que l'on peut interroger, faire passer un examen,
partager, installer chez quelqu'un d'autre et retirer proprement.

> 💡 **Le principe.** *Écrire dans la mémoire, c'est apprendre.* Il n'y a pas d'étape
> d'entraînement entre le moment où un document entre et le moment où Damba répond dessus. Le
> savoir est fait de faits et de règles ordinaires, avec leur provenance, et il se retire comme il
> s'est posé.

> 🎯 **Cas d'usage.** Un cabinet dépose sa politique interne et deux normes du secteur. Damba en
> tire des définitions, des obligations, des durées et des règles, chacune rattachée à l'unité de
> texte dont elle vient. Une question trouve sa réponse et l'article qui la porte. Un collègue
> reçoit la même expertise en une commande, et elle se comporte chez lui exactement comme chez
> vous.

## Ce qu'est une expertise

Un objet nommé qui rassemble quatre choses :

| Contenu | Ce que c'est |
| --- | --- |
| **Faits** | ce que les documents affirment, chacun cité à son unité de source |
| **Règles** | les « si … alors … » du domaine, exceptions comprises |
| **Documents** | les unités de source elles-mêmes, avec leur version |
| **Vocabulaire** | les termes du domaine et leurs équivalents, tirés des définitions |

L'expertise n'est pas un format à part : ce sont des faits et des règles de la mémoire, groupés
sous un nom. C'est ce groupement qui rend possible l'installation, l'examen et le retrait en bloc.

## Des documents à une expertise

Un document normatif ne se lit pas en bloc. Il se découpe d'abord en **unités** : un article, un
alinéa, une section de norme. Chaque fait retenu garde le nom de son unité, ce qui donne la
citation sans effort au moment de répondre.

```ts
import { buildExpertise, installExpertise } from '@damba/libxn';

const expertise = buildExpertise({
  slug: 'politique-interne',
  documents: [{ name: 'politique-2026', text: contenuDuDocument }],
});

await installExpertise(kb, expertise);
```

Dans le produit, cela se dit en une phrase dans le chat : « apprends ce document comme expertise
de la politique interne ». Le bouton à côté d'un document chargé fait la même chose.

## L'examen : mesurer, pas déclarer

Dire qu'un système « est devenu expert » ne veut rien dire tant que personne ne l'a interrogé.
Damba **génère lui-même** un examen à partir de ce qu'il vient d'apprendre, puis y répond sans
appeler d'IA, et rend un rapport.

```ts
import { generateRecallQuestions, runExam } from '@damba/libxn';

const questions = generateRecallQuestions(expertise);
const rapport = await runExam(kb, questions);
// rapport.recall.ratio       → ce qui est retrouvé
// rapport.recall.citedRatio  → ce qui est cité à la bonne source
```

Deux chiffres, pas un : **retrouver** une information et **savoir d'où elle vient** sont deux
capacités différentes, et un système peut tenir la première en manquant la seconde.

> ⚠️ **Ce que l'examen mesure, et ce qu'il ne mesure pas.** Il mesure le rappel, l'application des
> règles et la citation. Il ne mesure pas l'argumentation ni l'interprétation. « Répond juste,
> cite juste, sans consommer de jetons, sur des cas de la forme du corpus » est une promesse
> vérifiable ; « expert de haut niveau » n'en est pas une.

## Le cas doit rejoindre les règles

Un domaine a son vocabulaire, et personne ne parle dans ce vocabulaire quand il pose une question.
Une règle écrite avec les mots d'un code ne se déclenchera jamais si le cas est décrit avec les
mots de tous les jours.

L'expertise construit donc son propre **vocabulaire** à partir des définitions du corpus, et s'en
sert au moment d'écrire : un énoncé entrant est rapproché des termes du domaine avant d'être
enregistré. Le sujet n'est jamais touché, un rapprochement trop faible est ignoré, et chaque
changement est consigné.

C'est la différence entre une base qui contient la bonne règle et une base où la règle se
déclenche.

## Partager, installer, retirer

Une expertise se partage par **copie**, jamais par lien vivant : partager donne le droit
d'installer, installer fait une copie. Un lien vivant changerait le comportement du destinataire
dans son dos le jour où l'auteur modifie sa base.

```ts
import { exportExpertise, importExpertise, uninstallExpertise } from '@damba/libxn';

const json = exportExpertise(expertise);       // transportable
const recue = importExpertise(json);            // validée à l'entrée
uninstallExpertise(kb, 'politique-interne');    // retrait en bloc
```

Le retrait est propre parce que le groupement l'est : les faits et les règles posés par
l'expertise partent ensemble, et rien d'autre ne bouge.

## Ce que l'acquisition doit encore à l'IA

Il faut le dire tel quel, parce que la mesure a été faite et publiée.

Une lecture **sans IA** d'un texte normatif reconnaît ce qui s'y répète : les définitions, les
sanctions, les durées, les obligations. Mesurée sur des corpus publics entiers (un code criminel
en deux langues, deux normes techniques), cette lecture couvre environ **un dixième** des phrases.
Le reste est de la prose qu'il faut comprendre, pas seulement reconnaître.

Autrement dit :

- **immédiat à l'usage : réel.** Une fois l'information écrite, elle se relit intégralement, se
  cite, s'applique par des règles, et la réponse ne coûte pas de jetons.
- **immédiat à l'acquisition : pas encore.** L'extraction depuis un document dépend d'une IA pour
  environ neuf phrases sur dix, avec la quarantaine et la validation qui l'encadrent.

Ce que l'étude a produit et qui reste acquis : la citation par unité de source, l'examen généré, le
vocabulaire du domaine, et l'objet expertise lui-même. Ce sont les outils qui rendent l'extraction
**auditable**, pas un remplaçant de l'extraction.

## À côté

- [Règles & induction](/rules) — les règles, leurs exceptions et leur provenance
- [Compétences](/skills) — le savoir-faire, à distinguer du savoir de domaine
- [Provenance des faits](/fact-provenance) — « pourquoi je sais ça ? »
- [Droit à l'oubli](/right-to-forget) — retirer sans casser ce qui en dépend
