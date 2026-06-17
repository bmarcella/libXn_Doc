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
| **Écriture** (`tell`, `retract`, `confirm`, `editFact`) | **toujours** dans la couche primaire ; les parents restent intacts |
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

### Les fonctions de cet exemple, argument par argument

**`new XNeuroneGrid(undefined, { headless: true })`** — construit le graphe QPath en mémoire qui sert de support à chaque `KnowledgeBase`.

- `encoder?` (1ᵉʳ arg, ici `undefined`) : l'encodeur qui transforme une donnée en paires de bits. Optionnel — `undefined` retient l'**encodeur par défaut** (`BinaryConverter.toBinaryPairs`), qui couvre les primitives/tableaux/objets. On ne le passe que pour un encodage sur-mesure.
- `opts?` (2ᵉ arg, ici `{ headless: true }`) : `{ headless?: boolean }`. `headless: true` = **sans rendu** (Node/serveur) ; aucune vue Three.js n'est attachée. Par défaut (`headless` absent/`false`), la grille tente d'attacher la vue enregistrée via `XNeuroneGrid.viewFactory` si elle existe. En contexte couches, on est **toujours headless** : la grille n'est qu'une mémoire de travail.

**`new KnowledgeBase(grid)`** — enrobe une grille pour exposer le modèle de faits (`tell`/`ask`/`reason`…).

- `grid` (seul argument, requis) : la `XNeuroneGrid` qui porte le graphe. Si la grille pré-existe (snapshot rechargé), le constructeur **reconstruit ses index** au passage. Une `KnowledgeBase` = une grille + une couche d'index/raisonnement.

**`new LayeredKnowledgeBase(primary, parents?)`** — empile plusieurs `KnowledgeBase` lues comme une seule.

| Argument | Rôle | Défaut |
|---|---|---|
| `primary` | la couche **d'écriture** (la plus spécifique — conversation/utilisateur). **Toutes** les écritures (`tell`, `retract`, `confirm`, `editFact`) y atterrissent. | — (requis) |
| `parents?` | les couches **parentes en lecture seule**, ordonnées **de la plus à la moins spécifique** (`[utilisateur, organisation, générique]`). La pile effective est `[primary, ...parents]`. | `[]` (aucune couche parente) |

> 💡 Une `LayeredKnowledgeBase` **est** une `KnowledgeBase` (elle en hérite) : on la passe partout où une KB est attendue. Sa propre grille interne est headless et vide — toutes les méthodes qui touchent au graphe sont surchargées pour interroger la pile.

**`await base.tell('config', 'theme', 'sombre')`** — enregistre un fait `(sujet, prédicat, objet)`.

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | le **sujet** du fait | — (requis) |
| `p` | le **prédicat** (la relation) | — (requis) |
| `o` | l'**objet** (la valeur) | — (requis) |
| `source?` | la **provenance** (`{ kind, ref?, at?, confidence? }`) — d'où vient le fait (`user`, `document`, `web`, `tool`…) | — (aucune provenance) |
| `flags?` | les **drapeaux** (`{ closed?, major?, secret?, group?, companionOf? }`) — décidé 🔒, structurant ⭐, secret 🔑, groupe d'accès, fait compagnon | — (aucun drapeau) |

> Sur une `LayeredKnowledgeBase`, `tell` route **toujours** vers `primary` — les parents restent intacts. La valeur de retour est `Promise<ContradictionReport | null>` : `null` si tout va bien, sinon un rapport décrivant la contradiction directe détectée à l'écriture.

**`kb.ask('config', 'theme')`** — lit les valeurs d'un couple `(sujet, prédicat)`.

- `s` (requis) : le sujet recherché.
- `p` (requis) : le prédicat recherché.

Retourne un `string[]` : la liste des objets connus pour ce couple (vide si rien). Sur la pile, c'est la **première couche** qui connaît le couple qui répond (le plus spécifique gagne) ; les couches du dessous ne sont pas consultées pour ce couple.

**`kb.reason('tweety', 'est')`** — raisonne sur la pile entière (faits directs + chaînes transitives/héritage).

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | le sujet de départ | — (requis) |
| `p` | le prédicat à suivre | — (requis) |
| `depth?` | profondeur maximale de la chaîne (nombre de sauts transitifs explorés) | `3` |
| `visited?` | ensemble interne des sujets déjà visités (anti-cycle) — usage récursif, **ne pas passer** en appel normal | `new Set()` |

Retourne une `ReasoningChain | null` : `null` si aucune conclusion ; sinon `{ steps, conclusion: { s, p, o }, confidence, via }` où `via` vaut `'direct'` (fait trouvé tel quel) ou `'transitive'` (déduit par une chaîne) et `confidence` est le minimum des confidences des étapes (« la chaîne est aussi forte que son maillon le plus faible »).

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
