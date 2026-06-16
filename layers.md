# Sous-couches — la mémoire en couches

`LayeredKnowledgeBase` empile plusieurs mémoires **lues comme une seule**, du plus **spécifique**
au plus **générique** :

```
💬 conversation  →  👤 utilisateur  →  🏢 organisation  →  🌐 générique
   (surcouche)                                              (base)
```

Règle unique : **le plus spécifique gagne**, par `(sujet, prédicat)`. Une seule couche reçoit les
**écritures** (la primaire) ; les couches du dessous sont en **lecture seule**. Et comme tout passe
par les mêmes primitives, **le raisonnement opère sur la pile entière sans le savoir**.

## À quoi ça sert

- **Dev / prod** : la prod en base (lecture seule), une **surcouche dev** où l'on teste de nouveaux
  faits — sans toucher la prod (voir [Code dynamique](dynamic-behavior)).
- **Multi-locataire** : des **valeurs par défaut** au niveau organisation, **surchargées** par
  utilisateur. Personne ne duplique les défauts ; chacun n'écrit que ses exceptions.
- **Contexte de conversation** : ce qui est dit dans l'échange en cours vit dans la couche la plus
  haute, par-dessus la connaissance durable de l'utilisateur et de l'organisation.
- **Personnalisation / préférences** : un réglage utilisateur masque le défaut, pour ce réglage
  uniquement.

## Comment la pile résout

| Opération | Comportement |
|-----------|--------------|
| **Lecture** d'un `(sujet, prédicat)` | la **première couche** qui connaît ce couple répond ; les couches du dessous ne sont pas consultées pour ce couple |
| **Écriture** (`tell`, `retract`, `confirm`, `edit`) | **toujours** dans la couche primaire ; les parents restent intacts |
| **Énumérations** (sujets, prédicats…) | **union** de toutes les couches, dédupliquée, priorité au spécifique |
| **Raisonnement** (`reason`, héritage, Plot, Insight, règles, flux) | opère sur la **pile entière**, de façon transparente |

Et ce n'est pas que les faits bruts : les **drapeaux** (décidé/structurant), les faits **secrets** (Coffre),
les faits **compagnons** (profils/sections), le **contrôle d'accès par groupe**, les requêtes
**temporelles** (« à l'époque c'était X ») et les hooks de symboles se propagent **à travers toutes les
couches** — chacun résolu sur la couche qui porte réellement le fait. Autrement dit, Coffre, compagnons et
permissions fonctionnent aussi quand on raisonne sur la pile dev/prod, pas seulement sur une base simple.

C'est exactement la philosophie de **l'héritage avec exceptions** : une couche spécifique **masque**
la base pour les seuls couples qu'elle connaît, et la laisse transparaître partout ailleurs.

## En pratique

```ts
import { XNeuroneGrid, KnowledgeBase, LayeredKnowledgeBase } from '@damba/libxn';

// Base partagée (organisation / générique) — stable
const base = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await base.tell('config', 'theme', 'sombre');     // défaut de l'organisation
await base.tell('tweety', 'est', 'oiseau');

// Surcouche spécifique (utilisateur / conversation)
const overlay = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const kb = new LayeredKnowledgeBase(overlay, [base]);  // [spécifique, …, générique]

// Lecture : la pile entière, le plus spécifique gagne
kb.ask('config', 'theme');     // ['sombre']  ← hérité de la base
kb.reason('tweety', 'est');    // raisonne sur TOUTE la pile

// Écriture : toujours dans la surcouche ; les parents sont en lecture seule
await kb.tell('config', 'theme', 'clair');   // préférence de CET utilisateur
kb.ask('config', 'theme');     // ['clair']   ← la surcouche masque la base
base.ask('config', 'theme');   // ['sombre']  ← la base reste intacte
```

> Le même objet `kb` se passe à `reason`, `PlotReasoner`, `InsightEngine`, `RuleEngine`,
> `FlowRunner`… : ils raisonnent sur la pile sans code spécifique. C'est le polymorphisme —
> une `LayeredKnowledgeBase` **est** une `KnowledgeBase`.

## Meilleures pratiques

- **Ordonner du plus spécifique au plus générique** : `[conversation, utilisateur, organisation, générique]`. L'ordre **détermine qui gagne**.
- **Écrire dans la bonne couche** : le volatil et le personnel en haut ; les défauts partagés en base (par leurs propres canaux et droits). Ne pas polluer le générique avec du spécifique.
- **Masquage ≠ fusion** : pour un `(sujet, prédicat)`, la couche spécifique **remplace** la base (elle ne fusionne pas les objets). Si tu veux l'**union** de plusieurs valeurs, garde-les dans **la même** couche.
- **Garder les couches basses stables et curées** ; concentrer le churn dans la surcouche.
- **Isoler par compte / locataire** : une surcouche par utilisateur ou tenant ; ne **jamais** partager la couche haute entre comptes (la réinitialiser au changement de compte) — anti-fuite inter-comptes.
- **Piles peu profondes** : chaque lecture sonde les couches jusqu'à trouver ; éviter les empilements inutiles.
- **Cycle dev → prod** : tester dans la surcouche, puis **promouvoir** les faits validés vers la base (release taguée, annulable) — voir [Code dynamique](dynamic-behavior).

## Quand l'utiliser

| Situation | Couches ? |
|-----------|-----------|
| Une seule mémoire, un seul périmètre | non — une `KnowledgeBase` simple suffit |
| Défauts partagés + surcharges locales | **oui** |
| Tester des faits sans impacter la prod | **oui** (surcouche dev) |
| Contexte de conversation par-dessus le durable | **oui** |

> ⚠️ Les écritures via le handle en couches atterrissent **toujours** dans la primaire — on n'écrit
> jamais une couche parente par ce biais (elles ont leurs propres canaux et droits).
