# Extraction de faits — de la prose aux triplets

Vous parlez, vous collez un document : QPath en tire des **faits** `(sujet, prédicat, objet)` —
**sans LLM** par défaut, de façon **déterministe**. La chaîne va du texte brut jusqu'à l'écriture en
mémoire, en passant par une étape de **qualité** (normalisation, dédup, résolution d'entités).

> 💡 **L'idée.** L'extraction est une **suite d'étapes pures** : on découpe la prose en candidats, on
> les réconcilie (un même fait vu deux fois = plus de confiance), on les normalise et on ne garde que
> ce qui a du sens. Un LLM peut **voter** en plus, mais n'est jamais indispensable.

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
