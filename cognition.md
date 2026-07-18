# La couche cognitive

Comment QPath « pense », vue d'ensemble. QPath ne raisonne pas d'un seul bloc : c'est une **pile de
couches** posées autour d'une même **mémoire de faits**, du socle déterministe jusqu'aux briques qui
apprennent. Une règle gouverne l'ensemble :

> **Le déterministe décide, l'appris propose.** Une couche qui apprend reste **conseillère** tant qu'elle
> n'a pas fait ses preuves sur des données retenues. Rien ne change le comportement sans preuve.

```mermaid
flowchart TB
  subgraph DEC["Décide · déterministe · 0 token"]
    R["Raisonnement<br/>ask · héritage · agrégats · temporel"]
    ARB["Arbitrage par la preuve"]
  end
  subgraph PROP["Propose · appris · toujours vérifié"]
    G["Déduction générative"]
    P["Prédiction · mémoire qui apprend · réseaux QPath"]
    I["Routage d'intention"]
    C["Compréhension"]
  end
  KB[("Mémoire de faits<br/>sujet · prédicat · objet")]
  R --> ARB
  PROP -. propose .-> ARB
  ARB --> KB
  KB --> OUT(["Réponse ancrée & traçable"])

  classDef det fill:#0e2a1f,stroke:#2f9e7a,color:#bff6e2;
  classDef learn fill:#241a2e,stroke:#8a5cb0,color:#e6d4f5;
  classDef mem fill:#0d2030,stroke:#2f7fa9,color:#cfe9f7;
  class R,ARB det;
  class G,P,I,C learn;
  class KB mem;
```

## Le problème

Un assistant utile doit faire deux choses qui **s'opposent** : répondre **sûrement** (sans inventer, de
façon vérifiable) et répondre **largement** (y compris quand rien n'est écrit noir sur blanc). Un système
purement déterministe est sûr mais muet dès qu'il manque un fait ; un système purement appris est large
mais peut halluciner. La couche cognitive résout cette tension en **empilant** les deux, avec une règle
qui empêche l'appris de contaminer le sûr : **le déterministe décide, l'appris propose**. Résultat, on
gagne l'étendue sans perdre la garantie « d'où vient cette réponse ? ».

## Le socle : une mémoire de faits

Tout repose sur des faits `(sujet, prédicat, objet)` conservés dans la mémoire QPath, avec leur
provenance, leurs drapeaux et leur dimension temporelle. Ce n'est pas une brique parmi d'autres : c'est
le **substrat commun** que toutes les couches lisent et écrivent. Voir [Composants clés](/components) et
[Types de faits](/fact-types).

## Décider : le raisonnement déterministe

La première réflexe de QPath est de répondre **sans modèle de langage** : lecture directe, héritage et
transitivité, agrégats, quantificateurs, questions temporelles. Ces réponses sont **exactes,
reproductibles et gratuites** (0 token). C'est la thèse du produit. Voir [Types de
raisonnement](/reasoning-types) et le [Cycle de vie d'un prompt](/prompt-lifecycle).

## Décider : l'arbitrage par la preuve

Quand plusieurs voies pourraient répondre au même message, QPath tranche **par la preuve** plutôt que par
un ordre figé : chaque voie présente ce qu'elle sait, et un arbitre déterministe retient la revendication
la plus solide. Deux garde-fous : un fait connu l'emporte toujours sur une estimation, et un disjoncteur
de confiance préfère avouer l'incertitude plutôt que servir une réponse peu fiable. Voir
[Faire évoluer le routage](/prompt-lifecycle#faire-evoluer-le-routage-sans-rien-casser).

## Proposer : les briques qui apprennent

Autour du socle vivent des couches qui **proposent**, toujours ramenées à la mémoire de faits et
vérifiées avant d'influer sur une réponse :

- **[Déduction générative](/generative-deduction)** : combler un maillon manquant par déduction ancrée.
- **[Prédiction](/prediction) et [mémoire qui apprend](/nap-grid)** : estimer une valeur ou une classe de
  façon auditable, à partir des faits.
- **[Réseaux QPath](/qpath-ml)** : apprentissage directement sur la représentation de la mémoire.
- **[Routage d'intention](/intent-routing)** : comprendre ce que le message veut faire.
- **[Compréhension](/comprehension)** : coréférence et sens, résolus via la mémoire.

Aucune de ces couches ne décide seule. Elle **propose** ; l'arbitrage et la vérification décident si la
proposition mérite d'être servie.

## En pratique — une question qui traverse les couches

> 🎯 **Cas d'usage.** Un assistant d'entreprise reçoit deux questions. La première a une réponse dans les
> faits : la couche déterministe **décide**, à 0 token, avec la preuve. La seconde n'a **aucun fait**
> stocké : une couche apprenante **propose** une estimation, clairement marquée comme telle. La règle d'or
> garantit qu'un fait connu l'emporte toujours sur une estimation.

```ts
import { KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

// La mémoire de faits, alimentée par l'ingestion (ici à la main pour l'exemple).
const kb = new KnowledgeBase(new XNeuroneGrid());
await kb.tell('felix', 'est', 'chat');
await kb.tell('chat', 'est', 'mammifere');

// 1) DÉCIDER (déterministe, 0 token). « Felix est-il un mammifère ? » se déduit par héritage.
kb.isA('felix', 'mammifere');            // → true, décidé sur les faits, avec la chaîne felix→chat→mammifère
const chain = kb.reason('felix', 'est'); // → la trace complète, pour prouver la réponse

// 2) PROPOSER (appris, vérifié). Aucune valeur n'est stockée pour ce cas :
kb.ask('felix', 'poids');                // → []  (le déterministe ne peut rien affirmer)
// … une couche apprenante (prédiction) peut alors PROPOSER une estimation à partir des cas connus,
//    marquée comme estimation. Si un vrai poids est ensuite affirmé, il écrase l'estimation.
```

Le point clé : la même question ne prend pas le même chemin selon que la mémoire **sait** ou non. Quand
elle sait, la réponse est exacte et prouvée ; quand elle ignore, une proposition ancrée prend le relais,
sans jamais se faire passer pour un fait. Le trajet complet, tier par tier, est décrit dans le
[Cycle de vie d'un prompt](/prompt-lifecycle).

## Pourquoi cette architecture

> 💡 **Ce qu'elle garantit.** Mettre le déterministe d'abord donne des réponses **vérifiables et
> gratuites** ; garder l'appris en conseiller et tout ramener à des faits **traçables** évite la boîte
> noire. On peut toujours répondre à la question « d'où vient cette réponse ? ».

En pratique, une réponse suit ce trajet : la mémoire et le raisonnement déterministe tentent d'abord, les
couches apprenantes proposent quand le déterministe ne suffit pas, l'arbitrage tranche, et la génération
n'intervient qu'en dernier recours, **ancrée** sur des faits récupérés. Le détail pas à pas est dans le
[Cycle de vie d'un prompt](/prompt-lifecycle).
