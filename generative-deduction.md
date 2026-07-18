# Déduction générative ancrée

QPath ne génère pas du contenu en *échantillonnant* un modèle, mais en **déduisant** à partir de ce
qu'il sait déjà. Le paquet `@damba/libxn-generative` ajoute une couche de **génération par
raisonnement** au-dessus de la mémoire : tout ce qui est produit est **ancré** dans des faits réels,
**tracé** (on sait *pourquoi* chaque pièce a été produite), et **déterministe** (même graine → même
sortie). Pur QPath : **0 token, aucune dépendance réseau** dans le cœur.

> 💡 **Le principe.** Le contenu n'est pas *inventé*, il est **déduit** des faits existants
> (recombinaison, analogie, héritage). Quand il manque un maillon (un synonyme, un lien d'héritage, un
> fait), le moteur va **chercher la pièce manquante** — au besoin via une source externe **injectée**
> (web…) — la **valide**, l'écrit **en quarantaine**, puis **reprend** la déduction. La promotion vers
> la mémoire de référence reste une **validation humaine**.

## Pourquoi « ancrée » et pas « générative » tout court

Une génération libre, au fil de l'eau, produit du plausible *non vérifiable*. La déduction générative
fait l'inverse :

- **Ancrage** — chaque élément émis est une **valeur réellement stockée** ou une conclusion **déduite**
  de faits réels. Pas d'invention.
- **Auditabilité** — chaque sortie porte sa **trace de déduction** : lecture directe, analogie,
  héritage, recombinaison, ou maillon comblé (et par quelle source).
- **Déterminisme** — un générateur de hasard **reproductible** (graine) rend toute génération rejouable
  à l'identique. Indispensable pour tester, comparer, certifier.
- **Sous contrainte** — la génération s'appuie sur la mémoire ; ce qui est **décidé** (🔒) ou
  **structurant** (⭐) pèse davantage.

C'est l'opposé d'une « boîte qui écrit » : c'est une **boîte qui déduit, et montre son raisonnement**.

## Les modes de génération

| Mode | Déduit… | Coût | Exemple |
| --- | --- | --- | --- |
| **Recombinaison** | de nouvelles suites de **valeurs réelles** le long des chemins appris | 0 | recompose à partir du contenu ingéré |
| **Analogie** | l'objet d'un fait par **transformation structurelle** (A:B :: C:?) | 0 | `main.ts → main.js` ⇒ `app.ts → app.js` |
| **Héritage** | un attribut **hérité d'une classe** (avec exceptions) | 0 | « Socrate est humain ; l'humain a la raison » ⇒ Socrate a la raison |
| **Complétion** | la **suite** d'une entrée partielle + des variantes | 0 | complète / décline une amorce |
| **Données synthétiques** | des lignes **plausibles** selon les distributions apprises | 0 | jeux de test respectant les proportions réelles |
| **Synonyme (à la demande)** | un **alias** d'un terme | 0 (local) ou externe | « ia » ≡ « intelligence artificielle » |
| **Régression** | une **valeur numérique** depuis des features, **sous porte de confiance** | 0 | estimer un prix depuis des caractéristiques apprises |
| **Classification** | une **classe** depuis des features, **sous porte de confiance** | 0 | typer une entité depuis son profil |

Tous les modes sont **0 token** tant qu'on déduit du connu. Seul le **comblement** d'un maillon
manquant peut solliciter une source externe — et uniquement si l'hôte en a branché une.

> 🎯 **Porte de confiance.** Régression et classification sont **approchées** (la mémoire est
> non-injective). Elles ne rendent une valeur **que** si l'incertitude est sous un seuil (échantillons,
> dispersion, marge) ; sinon elles n'émettent **rien** plutôt qu'un résultat douteux. La détection
> d'incertitude est intégrée, pas optionnelle.

## Combler les maillons manquants — d'abord la mémoire, le web en dernier

Quand la déduction **cale** (aucune valeur pour `(sujet, prédicat)`, classe parente inconnue, synonyme
requis), le moteur ne court **pas** directement sur le web. Il cherche d'abord la pièce manquante, par
**déduction pure (0 token)**, dans **toute la connaissance qu'il peut atteindre**, du plus spécifique au
plus large :

1. la **conversation** et les **documents ingérés** ;
2. la mémoire **de l'utilisateur** ;
3. la mémoire **de l'organisation** ;
4. la **connaissance partagée / les packs**.

Lecture directe, héritage, analogie, résolution approchée et synonymes **traversent toutes ces couches**
avant tout appel externe. Ce n'est **que** si aucune de ces sources ne sait que le moteur sollicite une
**source externe injectée par l'hôte** (par exemple une recherche web). Le cœur ne sait rien de cette
source : elle entre par un **port**, jamais par une dépendance — le paquet reste portable et
déterministe.

Le candidat récupéré ne touche **jamais** la mémoire de référence directement :

1. il est **normalisé et validé** (mêmes règles que l'ingestion : pas de terme vide/incohérent) ;
2. il est **dédupliqué** contre ce qui est déjà connu ;
3. il est écrit **en quarantaine** (une sous-couche jetable), avec sa **provenance** et **jamais**
   marqué « décidé » (il reste révérifiable) ;
4. la génération s'en sert pour continuer ;
5. **un humain valide** ensuite : *promouvoir* (le fait rejoint la mémoire de référence) ou *rejeter*.

> 🔒 **Garde-fou.** Le nombre d'appels externes est **borné**, la mémoire de référence n'est enrichie
> que par une **décision humaine explicite**, et chaque fait comblé conserve l'URL/identifiant de sa
> source — auditável et purgeable.

## L'API en pratique

Le `DeductiveGenerator` s'instancie au-dessus d'une `KnowledgeBase`. Le port de comblement externe
(web…) est **injecté** — absent, la génération est **100 % hors-ligne et déterministe**.

```ts
import { KnowledgeBase, XNeuroneGrid } from '@damba/libxn';
import { DeductiveGenerator, type GapResolverPort } from '@damba/libxn-generative';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('main.ts', 'compile_en', 'main.js');
await kb.tell('util.ts', 'compile_en', 'util.js');
await kb.tell('socrate', 'est', 'humain');
await kb.tell('humain', 'a', 'raison');

// Port de comblement EXTERNE (web…) — DERNIER recours. Absent ⇒ offline, 0 token, 0 réseau.
const resolver: GapResolverPort = {
  async resolve(gap) {
    if (gap.kind === 'fact' && gap.s === 'tokyo' && gap.p === 'pays') {
      return [{ s: 'tokyo', p: 'pays', o: 'japon', confidence: 0.88, ref: 'https://…' }];
    }
    return [];
  },
};

const gen = new DeductiveGenerator(kb, { resolver, seed: 'demo' });

// 1) Analogie structurelle — déduit « app.js » des exemples connus.
const a = await gen.analogize('app.ts', 'compile_en');
//    → { items: ['app.js'], trace: [{ via: 'analogy', detail: '…' }] }

// 2) Héritage — attribut hérité de la classe (avec exceptions).
await gen.inherit('socrate', 'a');                 // → { items: ['raison'], … }  (via « humain »)

// 3) Données synthétiques — selon les distributions APPRISES, reproductible à graine fixe.
gen.synthesize({ fields: [{ name: 'ville', predicate: 'ville' }] }, 5);

// 4) Comblement ANCRÉ → QUARANTAINE → promotion HUMAINE.
await gen.analogize('tokyo', 'pays');              // trou comblé via le resolver (mémoire d'abord)
gen.pendingPromotions();                           // → [{ s:'tokyo', p:'pays', o:'japon', confidence:0.88, ref }]
kb.ask('tokyo', 'pays');                           // → []      (RIEN en prod avant validation)
await gen.promote('tokyo', 'pays', 'japon');       // ← geste HUMAIN
kb.ask('tokyo', 'pays');                           // → ['japon']  (promu, avec provenance)
```

> Pour fouiller AUSSI les documents ingérés et la mémoire org/user avant le web, on passe des KB
> concrètes en `parents`, et une `scope` pour la RBAC : `new DeductiveGenerator(kb, { parents, scope, resolver, seed })`.

## Référence des fonctions

Chaque fonction est décrite avec sa **signature**, ses **paramètres** et un **exemple**.

### Construire le générateur — `new DeductiveGenerator(kb, options?)`

| Paramètre | Type | Défaut | Rôle |
| --- | --- | --- | --- |
| `kb` | `KnowledgeBase` | — | Mémoire de travail (conversation + documents ingérés). Sa **grille** sert à la recombinaison et à la complétion. |
| `options.parents` | `KnowledgeBase[]` | `[]` | Rings **supplémentaires** fouillés par déduction pure AVANT le web (mémoire user, org, générique, packs). KB **concrètes**. |
| `options.scope` | `GenerationScope` | tout autorisé | **Autorisation (RBAC)** + **isolation par domaine** : filtre chaque fait lu/émis/comblé. |
| `options.gapFlags` | `FactFlags` | `{}` | Drapeaux (`group`/domaine) apposés aux faits **comblés** → ils restent scopés une fois promus. |
| `options.resolver` | `GapResolverPort` | — | Source **externe** (web…) injectée. **Dernier recours.** Absent ⇒ 100 % hors-ligne, déterministe. |
| `options.seed` | `string \| number` | constante | **Graine** de reproductibilité (même graine → même sortie). |
| `options.maxGaps` | `number` | `8` | Plafond d'**appels externes** sur la durée de vie du générateur. |

```ts
const gen = new DeductiveGenerator(kb, {
  parents: [userKb, orgKb],
  scope: composeScopes(groupScope({ allowedGroups: ['equipe-chimie'] }), domainScope({ domain: 'chimie' })),
  gapFlags: { group: 'equipe-chimie' },
  resolver: webResolver,
  seed: 'rapport-2026',
});
```

### Le résultat commun — `GenResult`

Toutes les fonctions de génération renvoient **la même forme** :

```ts
interface GenResult<T> {
  items: T[];               // les éléments produits
  trace: DeductionStep[];   // POURQUOI chaque élément a été produit
  gapsFilled: FilledGap[];  // maillons comblés (mis en quarantaine, à valider)
  pendingGaps: Gap[];       // trous NON comblés (resolver absent / épuisé)
}
interface DeductionStep {
  via: 'direct' | 'approx' | 'inherited' | 'analogy' | 'recombination'
     | 'regression' | 'classification' | 'gap-filled';
  fact?: { s: string; p: string; o: string };  // le fait mobilisé
  detail?: string;                              // explication lisible
}
```

### `analogize(s, p)` — déduire par analogie structurelle

Déduit l'objet de `(s, p)` quand il est une **transformation structurelle** du sujet. Ordre interne :
lecture directe → résolution approchée → analogie → comblement externe.

| Paramètre | Type | Rôle |
| --- | --- | --- |
| `s` | `string` | Le **sujet** dont on cherche l'objet (ex. `'contrat.pdf'`). |
| `p` | `string` | Le **prédicat** / la relation (ex. `'exporte_en'`). |

**Retour :** `Promise<GenResult<string>>` — `items` = l'objet déduit.

```ts
await kb.tell('facture.pdf', 'exporte_en', 'facture.csv');
await kb.tell('devis.pdf',   'exporte_en', 'devis.csv');

const r = await gen.analogize('contrat.pdf', 'exporte_en');
r.items;          // → ['contrat.csv']
r.trace[0].via;   // → 'analogy'
r.trace[0].detail // → 'analogie depuis (facture.pdf → facture.csv), conf 1.00'
```

### `inherit(s, p)` — déduire par héritage de classe

Remonte les classes de `s` (`est`/`subclass_of`…) et renvoie l'attribut `p` **hérité**, en respectant
les **exceptions** (un `not_p` plus proche bloque un `p` plus lointain).

| Paramètre | Type | Rôle |
| --- | --- | --- |
| `s` | `string` | L'**instance** (ex. `'socrate'`). |
| `p` | `string` | L'**attribut** recherché (ex. `'a'`). |

**Retour :** `Promise<GenResult<string>>` — `items` = valeurs héritées.

```ts
await kb.tell('socrate', 'est', 'humain');
await kb.tell('humain',  'a',   'raison');

const r = await gen.inherit('socrate', 'a');
r.items;          // → ['raison']
r.trace[0].via;   // → 'inherited'
r.trace[0].detail // → 'décidé par humain (distance 1)'
```

### `recombine(seed, options?)` — recombiner des valeurs réelles

Émet des **valeurs réellement stockées** le long des chemins appris (marche ancrée, seedable). Ne
fabrique jamais de valeur ; recompose l'existant.

| Paramètre | Type | Défaut | Rôle |
| --- | --- | --- | --- |
| `seed` | `unknown` | — | Point de départ (localise la zone de la grille). |
| `options.steps` | `number` | `8` | Nombre d'éléments à émettre. |
| `options.temperature` | `number` | `1` | `<1` privilégie les chemins fréquents, `>1` explore davantage. |
| `options.constraint` | `(v) => boolean` | — | Filtre : un élément rejeté n'est pas émis. |

**Retour :** `GenResult` (synchrone) — `items` = valeurs recombinées.

```ts
const r = gen.recombine('rapport', { steps: 5, temperature: 0.7 });
r.items;          // → fragments réellement ingérés, recombinés
```

### `complete(partial, options?)` — compléter / décliner une amorce

Complète une entrée **partielle** (via la prédiction de la grille) et peut produire des **variantes**.

| Paramètre | Type | Défaut | Rôle |
| --- | --- | --- | --- |
| `partial` | `unknown` | — | L'amorce à compléter. |
| `options.variants` | `number` | `0` | Nombre de variantes supplémentaires (marches seedées). |
| `options.steps` | `number` | `4` | Longueur de chaque variante. |

**Retour :** `GenResult` (synchrone).

```ts
const r = gen.complete('config.pro', { variants: 3 });
r.items;          // → complétions + 3 variantes
```

### `synthesize(schema, n)` — générer des données plausibles

Produit `n` lignes dont chaque champ est **échantillonné selon la distribution réelle** apprise pour
son prédicat — mêmes valeurs, mêmes proportions que la mémoire. Reproductible à graine fixe.

| Paramètre | Type | Rôle |
| --- | --- | --- |
| `schema` | `{ fields: { name: string; predicate: string }[] }` | Les colonnes : `name` = nom de sortie, `predicate` = prédicat appris. |
| `n` | `number` | Nombre de lignes à générer. |

**Retour :** `GenResult<Record<string, string>>` — `items` = les lignes.

```ts
await kb.tell('p1', 'ville', 'paris');
await kb.tell('p2', 'ville', 'paris');
await kb.tell('p3', 'ville', 'lyon');

const r = gen.synthesize({ fields: [{ name: 'ville', predicate: 'ville' }] }, 100);
// 100 lignes { ville: 'paris' | 'lyon' }, ~2/3 paris — comme la mémoire
```

### `resolveSynonym(term)` — trouver un alias (à la demande)

Cherche un **alias** (`same_as`) du terme : d'abord les alias déjà connus (0 token), sinon comblement
externe → quarantaine. Déclenché **explicitement** par l'hôte (jamais automatiquement).

| Paramètre | Type | Rôle |
| --- | --- | --- |
| `term` | `string` | Le terme à réconcilier (ex. `'ia'`). |

**Retour :** `Promise<GenResult<string>>` — `items` = alias.

```ts
await kb.tell('ia', 'same_as', 'intelligence_artificielle');
const r = await gen.resolveSynonym('ia');
r.items;          // → ['intelligence_artificielle']
```

### `regress(features)` / `classify(features)` — prédire sous porte de confiance

Prédisent une **valeur numérique** (`regress`) ou une **classe** (`classify`) à partir d'un vecteur de
**features**, via un `Predictor` branché sur une **grille de features entraînée** (≠ la mémoire de
triplets). Le résultat est **approché** : il n'est émis **que** si la confiance dépasse les seuils,
sinon `items` est **vide** — la trace explique pourquoi.

| Élément | Type | Rôle |
| --- | --- | --- |
| `options.predictor` | `Predictor` | Requis pour ces deux modes. Encapsule la grille de features + les **seuils** de confiance. |
| `features` | `unknown` | Le vecteur de caractéristiques (encodé par le **même** encodeur qu'à l'entraînement). |

**Retour :** `GenResult<number>` / `GenResult<string>` — `items` = `[valeur]` / `[classe]` si **confiant**, sinon `[]`.

```ts
import { Predictor } from '@damba/libxn-generative';

const predictor = new Predictor(featureGrid, {           // grille entraînée (train / trainClass)
  encoder,                                               // MÊME encodeur qu'à l'entraînement
  regression:     { minSamples: 3, maxRelStdDev: 0.15 }, // seuils d'incertitude
  classification: { minProbability: 0.7, minMargin: 0.2 },
});
const gen = new DeductiveGenerator(kb, { predictor });

gen.regress(features).items;   // → [valeur] si fiable, sinon []
gen.classify(features).items;  // → [classe] si fiable, sinon []
```

### `verify(s, p, o)` — vérifier un candidat contre la mémoire (filtre anti-bruit)

Vérifie, par **déduction pure (0 token)**, si un fait candidat `(s, p, o)` est **soutenu**,
**contredit** ou **inconnu** vis-à-vis de la connaissance déjà ancrée. **Conservateur** : il ne crie
« contredit » que sur des **signaux forts** (négation explicite, contrainte d'unicité, valeur
**verrouillée** 🔒 différente) — jamais sur une simple absence (un prédicat à plusieurs valeurs a
souvent plusieurs objets légitimes). Sert à **filtrer le bruit** d'une extraction de masse avant
l'écriture.

| Paramètre | Type | Rôle |
| --- | --- | --- |
| `s`, `p`, `o` | `string` | Le fait candidat à vérifier. |
| `options.support` | `boolean` | `true` (défaut) calcule aussi l'**appui** (analogie/héritage) ; `false` ne garde que la détection de contradiction (porte d'ingestion de masse, moins coûteuse). |

**Retour :** `VerifyVerdict` — `{ outcome: 'supported' | 'contradicted' | 'unknown', deduced, conflict?, reason, trace }`.

```ts
await kb.fact('terre', 'forme', 'ronde').closed().save();   // valeur décidée 🔒

gen.verify('terre', 'forme', 'ronde').outcome;  // → 'supported'   (déjà connu)
gen.verify('terre', 'forme', 'plate').outcome;  // → 'contradicted' (valeur verrouillée différente)
gen.verify('marie', 'aime', 'poires').outcome;  // → 'unknown'      (multivalué → on garde)
```

### `EntityClassifier` — déduire la classe d'une entité depuis son profil

Infère la **classe** d'une entité à partir de son **profil** (les prédicats qu'elle porte), sans
fait `est` explicite. Il **apprend** une grille de features sur les entités **déjà typées** du corpus
(profil ⇒ classe), puis **propose** une classe pour les entités non typées — **sous porte de
confiance**. Aucune écriture : les propositions sont des **candidats à valider** (même esprit que la
quarantaine).

| Méthode | Signature | Rôle |
| --- | --- | --- |
| `train(kb)` | `(kb): Promise<{ trained, labels }>` | Apprend profil ⇒ classe sur les entités **typées** (cumulable sur plusieurs KB). |
| `proposeUntyped(kb)` | `(kb): EntityClassProposal[]` | **Propose** une classe pour chaque entité non typée, gated par confiance. |
| `classify(features)` | `(string[]): EntityClassProposal \| undefined` | Classe un profil de traits isolé. |

```ts
import { EntityClassifier } from '@damba/libxn-generative';

const ec = new EntityClassifier({ thresholds: { minProbability: 0.6, minMargin: 0.15, minSamples: 2 } });
await ec.train(kb);                        // apprend sur « jean est personne », « acme est entreprise »…
const props = ec.proposeUntyped(kb);
// → [{ entity: 'paul', label: 'personne', probability, margin, samples, reason }]  (à valider)
```

### Validation humaine — `pendingPromotions()`, `promote(...)`, `reject(...)`

Un fait **comblé** (web) atterrit en **quarantaine** : il sert à la génération mais n'entre dans la
mémoire de référence que sur **décision humaine**.

| Fonction | Signature | Rôle |
| --- | --- | --- |
| `pendingPromotions()` | `(): PendingPromotion[]` | Liste les faits en quarantaine (`{ s, p, o, confidence, ref? }`). |
| `promote(s, p, o)` | `(s, p, o: string): Promise<boolean>` | **Valide** : copie le fait en mémoire (provenance + groupe conservés), le retire de la quarantaine. |
| `reject(s, p, o)` | `(s, p, o: string): boolean` | **Rejette** : retire de la quarantaine sans rien promouvoir. |

```ts
await gen.analogize('tokyo', 'pays');           // comble via le resolver → quarantaine
gen.pendingPromotions();                         // → [{ s:'tokyo', p:'pays', o:'japon', confidence:0.88, ref }]
await gen.promote('tokyo', 'pays', 'japon');     // ← l'humain valide
// ou : gen.reject('tokyo', 'pays', 'japon');    // ← l'humain refuse
```

### Le port externe — `GapResolverPort`

C'est **toi** qui décides d'où viennent les pièces manquantes (web, autre base…). Le paquet ne
contient aucune URL ni clé.

```ts
interface GapResolverPort {
  resolve(gap: Gap): Promise<GapCandidate[]>;
}
interface Gap          { kind: 'synonym' | 'inheritance' | 'fact'; s?: string; p?: string; o?: string; context?: string[]; }
interface GapCandidate { s: string; p: string; o: string; confidence: number; ref?: string; }
```

### Les politiques de scope — `groupScope`, `domainScope`, `composeScopes`

Construisent la `scope` passée au générateur (voir « Autorisation & isolation » plus bas).

| Fonction | Paramètres | Rôle |
| --- | --- | --- |
| `groupScope({ allowedGroups?, allowPublic? })` | groupes autorisés ; public par défaut autorisé | **RBAC** : un fait n'est utilisé que si son groupe est autorisé ; sans groupe = public. |
| `domainScope({ domain, domainOf?, allowMajorBridge?, allowUndomained? })` | domaine cible ; comment lire le domaine ; pont ⭐ ; faits sans domaine | **Isolation** : reste dans `domain` ; un fait ⭐ `major` peut ponter. |
| `composeScopes(...scopes)` | plusieurs politiques | **ET** : un fait doit satisfaire **toutes** les politiques. |

```ts
const scope = composeScopes(
  groupScope({ allowedGroups: ['equipe-chimie'], allowPublic: true }),
  domainScope({ domain: 'chimie' }),
);
```

## Exemples

**1. Analogie structurelle** — générer par transformation, à partir d'exemples connus :

```
main.ts  compile_en  main.js
util.ts  compile_en  util.js
```
`analogize("app.ts", "compile_en")` → **app.js** *(via analogie, confiance 1.00)*

**2. Héritage** — un attribut déduit de la classe (avec exceptions) :

```
socrate  est  humain
humain   a    raison
```
`inherit("socrate", "a")` → **raison** *(hérité de « humain », distance 1)*

**3. Données synthétiques** — des lignes plausibles, jamais inventées, selon les **proportions réelles** :

```
p1 ville paris · p2 ville paris · p3 ville lyon
```
`synthesize({ ville }, 5)` → 5 lignes où `ville ∈ {paris, lyon}` dans les mêmes proportions que la
mémoire — **reproductible** à graine fixe.

**4. Comblement ancré — la mémoire d'abord, le web en dernier** — `analogize("tokyo", "pays")` :

- si un **document ingéré** ou la mémoire **org/user** contient déjà « Tokyo → Japon » → réponse
  **directe, 0 token, sans web** ;
- sinon, le moteur interroge la source externe → candidat `tokyo pays japon` **mis en quarantaine**
  (provenance web, jamais « décidé ») → l'humain **promeut** (le fait rejoint la mémoire) ou **rejette**.

**5. Synonyme à la demande** — `resolveSynonym("ia")` → **intelligence_artificielle** (alias `same_as`) :
lu dans la mémoire s'il est connu, sinon comblé puis promu par un humain.

> Chaque sortie revient avec sa **trace** : `direct` / `approx` / `inherited` / `analogy` /
> `recombination` / `gap-filled` — on sait toujours *pourquoi* une pièce a été produite.

## Cas d'usage

| Situation | Ce que la déduction générative apporte |
|-----------|----------------------------------------|
| Décliner des variantes/squelettes cohérents à partir d'exemples (code, configs, libellés) | **analogie** structurelle, déterministe |
| Compléter une fiche/entité à partir d'entités semblables | **héritage** + **analogie** |
| Fabriquer des jeux de test/démo réalistes **sans inventer** | **données synthétiques** (distributions apprises) |
| Étendre la connaissance d'un sujet en s'appuyant d'abord sur les **documents** et la mémoire **org/user**, le web seulement si nécessaire | **comblement ancré** → quarantaine → promotion humaine |
| Réconcilier des termes (synonymes/alias) | `resolveSynonym` (`same_as`) |
| **Ingérer un gros texte sans le polluer** — écarter les faits contredits, typer les entités | `verify` (filtre anti-bruit) + `EntityClassifier` (classes proposées), tout à **valider** |
| Estimer une valeur / typer depuis des features, **seulement si fiable** | `regress` / `classify` **sous porte de confiance** |

### Scénarios concrets (avec code)

**A. Déduire le nom du fichier de sortie d'un build** — l'app connaît quelques exemples, en déduit le reste :

```ts
await kb.tell('main.ts', 'compile_en', 'main.js');
await kb.tell('app.ts',  'compile_en', 'app.js');

const out = await gen.analogize('worker.ts', 'compile_en');
out.items;        // → ['worker.js']   (déduit, pas deviné)
```

**B. Compléter une fiche entité depuis sa classe** — ce qu'on sait de la classe descend sur l'instance :

```ts
await kb.tell('client', 'a',  'adresse');
await kb.tell('client', 'a',  'email');
await kb.tell('acme',   'est', 'client');

const champs = await gen.inherit('acme', 'a');
champs.items;     // → ['adresse', 'email']   (champs hérités de « client »)
```

**C. Fabriquer un jeu de test réaliste** — mêmes valeurs et proportions que les vraies données :

```ts
for (const [u, role] of [['u1','admin'],['u2','membre'],['u3','membre'],['u4','membre']]) {
  await kb.tell(u, 'role', role);
}
const jeu = gen.synthesize({ fields: [{ name: 'role', predicate: 'role' }] }, 1000);
// 1000 lignes { role } ; ~75 % « membre », ~25 % « admin » — reproductible (graine fixe)
```

**D. Étendre un glossaire métier — l'org d'abord, le web en dernier, validation humaine** :

```ts
const gen = new DeductiveGenerator(kb, {
  parents: [orgKb],                                  // on cherche d'abord dans la mémoire de l'org
  scope: groupScope({ allowedGroups: ['mon-org'] }), // RBAC : rien d'une autre org
  gapFlags: { group: 'mon-org' },                    // un fait comblé reste rattaché à l'org
  resolver: webResolver,                             // dernier recours seulement
});

const def = await gen.analogize('sku', 'signifie');
if (def.gapsFilled.length) {
  // venu du web → en quarantaine ; un humain tranche
  gen.pendingPromotions();                           // → [{ s:'sku', p:'signifie', o:'…', ref }]
  await gen.promote('sku', 'signifie', def.items[0]);
}
```

> ❌ **Quand ne pas l'utiliser.** Pour de la **prose libre fluide**, ce n'est pas l'objectif (voir plus
> bas) : la force est le **structuré, le déductif et les données**.

## Autorisation & isolation contextuelle (RBAC)

La déduction générative **n'a accès qu'à ce que l'utilisateur a le droit de voir**, à tous les niveaux.
La sécurité est posée par **construction** puis renforcée par une **politique de scope** :

- **Cloisonnement par construction** — le moteur ne lit QUE les couches qu'on lui fournit (conversation,
  documents, mémoire **user**, **org**, partagée). La mémoire d'une **autre organisation** n'étant jamais
  fournie, elle ne peut **jamais** apparaître. Côté serveur, ces couches ne contiennent déjà que les
  faits **autorisés** (permissions par groupe).
- **RBAC par groupe** — chaque fait peut appartenir à un **groupe** d'accès. La génération n'utilise un
  fait que si son groupe est **autorisé** ; les faits **sans groupe** sont **publics**. « Seule la
  connaissance publique fournie par QPath est accessible à tout le monde » : on peut restreindre à
  *public seulement*.
- **Isolation contextuelle (domaine)** — pour ne pas **mélanger des domaines disjoints** (chimie ≠
  maths), la génération reste **dans son contexte**. Un fait d'un autre domaine n'est tiré que s'il
  porte un **lien ⭐ majeur** (structurant) — le seul pont autorisé entre domaines.
- **Comblement scopé** — un fait récupéré à l'extérieur est **tagué au contexte courant** (groupe/
  domaine) avant d'entrer en quarantaine, et **reste scopé** une fois promu ; un candidat qui sortirait
  du scope est **rejeté**.

Ces règles s'appliquent **uniformément à tous les modes** (direct, analogie, héritage, synonyme,
synthèse, comblement). Conséquence : une génération est toujours **logique, scopée et autorisée** — aucun
fait d'un groupe, d'une organisation ou d'un domaine non autorisé ne peut « fuir » dans une sortie.

## Déterminisme & reproductibilité

La marche générative s'appuie sur une source d'aléa **injectable** : sans graine, comportement habituel ;
avec une graine, la sortie est **identique à chaque exécution**. En mode hors-ligne (aucune source
externe branchée), une génération est donc **100 % reproductible** — ce qui en fait une brique testable
et certifiable, là où un échantillonnage classique ne l'est pas.

## Où ça s'inscrit

C'est le pendant **génératif** des [types de raisonnement](/reasoning-types) : les mêmes faits, la même
grille, mais cette fois pour **produire** du nouveau plutôt que seulement répondre. La génération suit
le même ordre que tout le pipeline : **déduction pure d'abord** (lecture directe → résolution
approchée → analogie → héritage), source externe **en tout dernier recours**, et tout reste **tracé**.

> La génération de prose fluide n'est volontairement **pas** l'objectif : la force de la déduction
> générative est le **structuré, le déductif et les données** — du nouveau qu'on peut **expliquer**.
