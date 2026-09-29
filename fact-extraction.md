# Extraction de faits — de la prose aux triplets

Vous parlez, vous collez un document : QPath en tire des **faits** `(sujet, prédicat, objet)` —
**sans LLM** par défaut, de façon **déterministe**. La chaîne va du texte brut jusqu'à l'écriture en
mémoire, en passant par une étape de **qualité** (normalisation, dédup, résolution d'entités).

> 💡 **L'idée.** L'extraction est une **suite d'étapes pures** : on découpe la prose en candidats, on
> les réconcilie (un même fait vu deux fois = plus de confiance), on les normalise et on ne garde que
> ce qui a du sens. Un LLM peut **voter** en plus, mais n'est jamais indispensable.

> 🎯 **Cas d'usage.** Vous collez le compte rendu d'un rendez-vous ou une fiche client rédigée à la main.
> Plutôt que de tout ressaisir en champs, QPath en tire des faits propres (« Marie · habite · Paris »,
> « Marie · travaille chez · Acme »), dédupliqués et reliés aux bonnes entités, prêts à être interrogés.
> Le problème résolu : transformer de la **prose** en **mémoire structurée** sans qu'un LLM invente ou
> déforme, et sans saisie manuelle.

## La chaîne en pratique

```ts
import { extractGrammar, runFactPipeline, ingestSmart, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

// 1) Extraction grammaticale (0 token) — multi-clause, ellipse de sujet, coréférence.
const candidates = extractGrammar('Marie aime les chats et déteste les chiens. Elle habite Paris.');
//    → [{ s:'marie', p:'aime', o:'chats' }, { s:'marie', p:'déteste', o:'chiens' },
//       { s:'marie', p:'habite', o:'paris' }]   ← « Elle » résolu en « marie »

// 2) Pipeline — réconcilie, normalise, résout les entités, type, score, rejette le bruit.
const { facts, dropped } = runFactPipeline(candidates, { kb });

// 3) Écriture intelligente — qualité + section document + unicité, en un appel.
await ingestSmart(kb, candidates);
kb.ask('marie', 'habite');   // → ['paris']
```

### Les fonctions

- **`extractGrammar(text, opts?)` → `RawCandidate[]`** — extraction déterministe : découpe multi-clause,
  hérite le sujet d'une clause à l'autre, résout les pronoms (« Elle » → dernier sujet), repère les
  relations spatiales/causales. `opts.lexicon` injecte une langue ; `opts.self` active la 1ʳᵉ personne.
- **`NaturalParser.parse(text, opts?)` → `ParsedInput`** — variante mono-clause : renvoie `{ kind, s, p, o }`
  où `kind` distingue **affirmation** / **question** (`what`, `yesno`) — une **question ne stocke rien**.
- **`runFactPipeline(candidates, ctx?)` → `{ facts, dropped }`** — le contrôle qualité : fusionne les
  doublons (confiance par accord), canonicalise via `ctx.aliases`/`ctx.kb` (faits `same_as`), type les
  faits, et renvoie les **rejets motivés** (`dropped[i].reason`).
- **`ingestSmart(kb, candidates, opts?)` → `Promise<…>`** — appelle le pipeline **puis écrit** : normalise,
  marque ⭐ les faits de classe, groupe en section de document, garantit l'unicité.

## Plusieurs langues — un lexique injectable

Tous les extracteurs lisent un **`LanguagePack`** (copules, conjonctions, négateurs, pronoms,
prépositions…). `DEFAULT_LEXICON` fusionne FR + EN ; on en dérive un sur mesure :

```ts
import { makeLexicon, DEFAULT_LEXICON, extractGrammar } from '@damba/libxn';

const techLex = makeLexicon({
  id: 'tech',
  verbForms: { ...DEFAULT_LEXICON.verbForms, 'déploie': 'déploie', 'logs': 'logs' },
});
extractGrammar('Alice déploie le service', { lexicon: techLex });   // verbe métier reconnu
```

- **`makeLexicon(overrides)` → `LanguagePack`** — fusionne vos marqueurs au défaut (nouvelle langue ou
  vocabulaire métier), sans toucher aux parseurs.

## Comprendre la nature d'un énoncé

Avant d'écrire, `classifyNotion` range l'énoncé dans sa **notion** (affirmation / causale / spatiale /
temporelle) et ses **aspects** (négation, secret, rectification) — pour le router vers la bonne
représentation :

```ts
import { classifyNotion } from '@damba/libxn';

classifyNotion('mon mot de passe est abc123');     // → { secret: true, … }         → Coffre
classifyNotion('non, je voulais dire Lyon');       // → { rectification: true, … }  → correction
classifyNotion('hier, Jean était à Paris');        // → { temporal: { dayOffset: -1 }, … }
```

- **`classifyNotion(text, lex?)` → `NotionAnalysis`** — déterministe, 0 token : un **secret** part au
  coffre, un **temps** fixe la validité du fait, une **rectification** corrige au lieu d'ajouter.

## Gros document — le plan en deux passes

Pour un livre ou un dossier, on lit **d'abord** tout le document pour en tirer un **plan** (entités
saillantes, vocabulaire, classes, homonymes), qui sert ensuite de contexte à l'extraction fine :

```ts
import { buildDocumentPlan } from '@damba/libxn';

// 1) Prépare les morceaux du document. `file` vient d'un upload (<input type="file">) ; on lit son
//    texte, puis on le découpe en paragraphes. `chunks` est donc un string[].
const documentText = await file.text();
const chunks = documentText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

// 2) Passe 1 — construire le plan à partir de ces morceaux.
const plan = await buildDocumentPlan(chunks);
plan.entities;   // [{ name:'jean', mentions:2, classes:['boulanger'] }, …]  trié par saillance
plan.homonyms;   // [{ name:'jean', classes:['boulanger','astronaute'] }]    ambiguïtés à lever
```

- **`buildDocumentPlan(chunks, opts?)` → `Promise<DocumentPlan>`** — passe 1 : renvoie un `tempKb`
  (KB jetable), les **entités** triées, le **vocabulaire** de prédicats, les **classes** et les
  **homonymes** — de quoi extraire la passe 2 de façon **cohérente à l'échelle du document**.

## Cas d'usage

| Situation | Ce que l'extraction apporte |
|---|---|
| Transformer un compte-rendu / une interview en faits interrogeables | `extractGrammar` → `runFactPipeline` → `ingestSmart` |
| Traiter un corpus FR + EN ou un jargon métier | `makeLexicon` (lexique injectable) |
| Trier secrets / corrections / dates avant écriture | `classifyNotion` (notions & aspects) |
| Ingérer un livre en gardant la cohérence (mêmes entités, homonymes) | `buildDocumentPlan` (plan 2-passes) |

> ✅ **Repli LLM optionnel.** Les candidats d'un extracteur LLM se mélangent aux candidats grammaticaux
> dans le **même** `runFactPipeline` : l'accord entre les deux **renforce la confiance**, et la qualité
> finale reste garantie par le pipeline — déterministe.

## Deux formes que la copule ne lit pas

La grammaire lit « X est Y » et les compléments prépositionnels. Deux formes pourtant ordinaires lui
échappaient, et elles ne produisaient **aucun** candidat : donner un nom, et le verbe de relation.

```ts
extractGrammar("Ma clinique s'appelle Dentaco.");  // → (clinique, nom, Dentaco)
extractGrammar('Le parc compte 42 logements.');    // → (parc, compte, 42 logements)
```

- **Nommage** (`extractNaming`) — « X s'appelle Y », « X est nommé Y », « X is called Y ». La casse du
  nom est préservée. Un attribut qui porte un verbe conjugué n'est pas un nom : « s'appelle comme tu
  veux » ne donne rien.
- **Verbe de relation** (`extractRelationVerb`) — la liste des verbes est **fermée**, et c'est ce qui
  rend ce lecteur sûr. N'y entrent que des verbes qui disent ce qui **est** ; un verbe qui raconte ce
  que quelqu'un **fait** ou **croit** (« je gère », « je pense ») n'y entre jamais. Le sujet doit être
  une entité nommée : un pronom reste au parseur général, à qui appartient la coréférence.

Les gardes ne bougent pas : une question n'écrit rien, un ordre non plus, un énoncé irréel non plus.

> 📏 **Mesuré, pas supposé.** Sur un corpus de conversation annoté à la main, ces deux lecteurs font
> passer la part des faits lus de 42,6 % à 57,4 %, et les questions auxquelles la mémoire sait
> répondre de 56 % à 84 % — **sans ajouter un seul faux fait** (leur part baisse même de 11,5 % à
> 8,8 %, le dénominateur ayant grandi).

## Décisions et questions restées ouvertes

« Qu'est-ce qu'on a décidé pour le dossier Laval ? » est exactement ce qu'on vient rechercher trois
semaines plus tard. Une décision se dit par un **verbe** (« on a tranché que »), pas par une copule :
la grammaire ordinaire la lisait très mal. `DecisionGrammar` la lit, sans appel à un modèle.

```ts
readDecisions("On a decide de relancer les locataires 90 jours avant l echeance.");
// → [{ kind: 'decided', text: 'relancer les locataires 90 jours avant l echeance',
//       cue: 'on a decide de' }]

readDecisions('Reste a trancher qui signe les avis.');
// → [{ kind: 'open_question', text: 'qui signe les avis', cue: 'reste a trancher' }]
```

- **`cue` dit POURQUOI la lecture a eu lieu** : la formule reconnue est rendue avec l'énoncé. La
  lecture est explicable, pas seulement correcte.
- **La liste de formules est fermée.** Une formule n'y entre que si elle **annonce** la décision ou
  l'ouverture. Un énoncé qui décrit une action (« on relance les locataires chaque lundi ») n'est pas
  une décision : c'est ce que quelqu'un fait, et l'écrire comme tranché inventerait un accord que
  personne n'a donné.
- **Le silence est la moitié du travail.** Une question posée à l'assistant attend une réponse au
  tour suivant : elle n'est pas « en suspens ». Un énoncé irréel (« peut-être qu'on retient… ») n'a
  rien tranché.

> 📏 **Mesuré sur des phrases jamais vues.** Sur le corpus de mise au point, la lecture est complète
> (9 décisions sur 9, 4 questions ouvertes sur 4, 55 silences sur 55) — mais ce chiffre ne prouve
> rien seul, puisque les formules ont été écrites en regardant ce corpus. Sur des phrases qui n'ont
> pas servi à les écrire : **11 reconnues sur 11**, et **10 silences tenus sur 10** face à des
> pièges choisis pour ressembler à des décisions.
