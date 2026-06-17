# Exemples

Un recueil de recettes courtes et concrètes. Tous les exemples utilisent l'API publique de
`@damba/libxn`. Pour des scénarios par métier, voir [Cas d'usage](use-cases).

## Mise en place

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const kb = new KnowledgeBase(grid);
```

`new XNeuroneGrid(encoder?, opts?)` :

| Argument | Rôle | Défaut |
|---|---|---|
| `encoder?` | fonction `(data) => [number,number][]` qui encode une entrée en paires de bits (« quats »). `undefined` = encodeur par défaut (`BinaryConverter.toBinaryPairs`). | encodeur par défaut |
| `opts?` | options ; seule clé `headless?: boolean`. `true` = aucun rendu Three.js (Node/serveur/test) ; `false` = attache la vue si une `viewFactory` est enregistrée. | `{}` (donc `headless` non posé → rendu si dispo) |

`new KnowledgeBase(grid)` prend **un seul argument** : la `grid` (le graphe QPath qui sert de mémoire de travail). Si la grille provient d'un snapshot rechargé, le constructeur reconstruit automatiquement ses index internes.

## Mémoire & faits

### 1. Stocker et lire des faits

```ts
await kb.tell('marc', 'aime', 'chocolat');
await kb.tell('marc', 'habite', 'montreal');

kb.ask('marc', 'aime');              // ['chocolat']
kb.askInverse('aime', 'chocolat');   // ['marc']  (qui aime le chocolat ?)
```

`kb.tell(s, p, o, source?, flags?)` enregistre un fait (sujet, prédicat, objet) :

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | sujet | requis |
| `p` | prédicat (relation) | requis |
| `o` | objet (valeur) | requis |
| `source?` | provenance du fait (d'où il vient) — utilisée par la provenance et la revérification | — (aucune source) |
| `flags?` | drapeaux du fait (`closed`, `major`, `secret`…) posés **atomiquement** avec l'écriture | — |

Retour : `Promise<ContradictionReport | null>` — `null` si tout va bien, un rapport de contradiction si le fait entre en conflit avec un fait existant. `tell` est **asynchrone** (l'écriture peut être persistée) ; les lectures (`ask`, `askInverse`…) sont **synchrones**.

- `kb.ask(s, p)` : sens **direct** (sujet + prédicat → objets). Renvoie un `string[]` (vide si rien).
- `kb.askInverse(p, o)` : sens **inverse** (prédicat + objet → sujets). Renvoie un `string[]`.

### 2. Requêtes ensemblistes (intersection / union)

```ts
await kb.tell('julie', 'aime', 'chocolat');
await kb.tell('julie', 'habite', 'montreal');

kb.askIntersect([['aime', 'chocolat'], ['habite', 'montreal']]); // ['marc', 'julie']
kb.askUnion([['aime', 'chocolat'], ['habite', 'paris']]);        // tous ceux qui matchent l'un OU l'autre
```

`askIntersect(conditions)` et `askUnion(conditions)` prennent **un seul argument** : `conditions`, un tableau de **couples `[prédicat, objet]`** (`Array<[string, string]>`).

- `askIntersect` : sujets qui satisfont **TOUTES** les conditions (ET logique). Renvoie `string[]` ; un tableau vide ou une condition sans aucun sujet donne `[]`.
- `askUnion` : sujets qui satisfont **AU MOINS UNE** condition (OU logique). Renvoie `string[]` dédupliqué.

### 3. Comparer deux sujets

```ts
const cmp = kb.askCompare('marc', 'julie');
cmp.common;   // facts identiques (ex. aime=chocolat, habite=montreal)
cmp.onlyIn1;  // propres à marc
cmp.onlyIn2;  // propres à julie
```

`kb.askCompare(s1, s2)` prend **deux sujets** à confronter. Retour : un objet à trois listes, chacune étant un tableau de couples `{ p, o }` (prédicat / objet) :

- `common` — faits **identiques** chez `s1` et `s2` (même prédicat **et** même objet) ;
- `onlyIn1` — faits présents **seulement** chez `s1` ;
- `onlyIn2` — faits présents **seulement** chez `s2`.

### 4. Similarité

```ts
kb.askSimilar('marc', 3).map(r => r.subject); // les 3 sujets les plus proches de 'marc'
```

`kb.askSimilar(s, topN?)` :

- `s` — le sujet de référence ;
- `topN?` — nombre maximum de sujets voisins à renvoyer (défaut **`5`**).

Retour : un tableau d'objets `{ subject, similarity, commonFacts }` trié du plus proche au plus lointain — `subject` (le sujet voisin), `similarity` (score de proximité) et `commonFacts` (nombre de faits partagés). Tableau vide si `s` n'a aucun fait.

## Raisonnement

### 5. Chaîne de raisonnement + trace lisible

```ts
import { ChainResolver } from '@damba/libxn';

await kb.tell('socrate', 'est', 'humain');
await kb.tell('humain', 'est', 'mortel');
await kb.tell('mortel', 'a', 'fin');

const chain = new ChainResolver(kb).chain('socrate', 'a');
ChainResolver.format(chain!);
// → "socrate —est→ humain —est→ mortel —a→ fin  (⇒ a = fin, confiance 1.00, via transitive)"
```

`new ChainResolver(kb, algebra?)` :

- `kb` — la base de connaissances à parcourir ;
- `algebra?` — l'algèbre des prédicats (comment composer des relations transitives) ; défaut `PredicateAlgebra.withDefaults()`. On ne le passe que pour personnaliser les règles de composition.

`resolver.chain(s, targetP, opts?)` cherche la chaîne **la plus courte** reliant `s` à un objet via le prédicat composé `targetP` (BFS) :

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | sujet de départ | requis |
| `targetP` | prédicat (éventuellement composé) à atteindre | requis |
| `opts?` | `{ maxDepth?, confidence? }` — profondeur max de la recherche et politique de confiance | `maxDepth: 4`, `confidence: 'min'` |

Retour : un objet `ReasoningChain` (avec `steps`, `conclusion`, `confidence`, `via`) ou **`null`** si aucune chaîne n'existe — d'où le `chain!` dans `format` quand on sait qu'il y en a une.

`ChainResolver.format(chain)` est une méthode **statique** : elle prend une `ReasoningChain` et renvoie une `string` lisible.

### 6. Toutes les conclusions possibles

```ts
const resolver = new ChainResolver(kb);
resolver.chainAll('socrate', 'est').map(c => c.conclusion.o); // ['humain', 'mortel', ...]
```

`resolver.chainAll(s, targetP, opts?)` a la **même signature** que `chain` (mêmes `opts` : `maxDepth` défaut `4`, `confidence` défaut `'min'`), mais renvoie **toutes** les chaînes valides — un `ReasoningChain[]` (et non une seule, ni `null`). Chaque élément expose `conclusion.o` (l'objet conclu).

### 7. Vérifier un fait dérivé (vrai / faux)

```ts
resolver.verifyChain('socrate', 'a', 'fin');     // true
resolver.verifyChain('socrate', 'a', 'plumes');  // false
```

`resolver.verifyChain(s, p, o, opts?)` vérifie qu'un fait **dérivé** `(s, p, o)` se déduit bien par chaînage :

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | sujet | requis |
| `p` | prédicat à atteindre | requis |
| `o` | objet attendu en conclusion | requis |
| `opts?` | mêmes options que `chain` (`maxDepth`, `confidence`) | `maxDepth: 4`, `confidence: 'min'` |

Retour : `boolean` — `true` si une chaîne existe **et** que sa conclusion correspond exactement à `o`, `false` sinon.

### 8. Règles métier → faits dérivés

```ts
import { RuleEngine } from '@damba/libxn';

const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X utilise typescript => X comprend javascript');
await rules.applyAllRules();

kb.askInverse('comprend', 'javascript'); // tous les utilisateurs de TS (déduit)
```

`new RuleEngine(kb, persistent?, store?, storageKey?)` :

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la base de connaissances sur laquelle dériver | requis |
| `persistent?` | si `true`, charge/sauve les règles via le `store` ; `false` = règles **en mémoire seulement** (comme ici) | `true` |
| `store?` | le magasin clé-valeur qui persiste les règles | `new MemoryStore()` |
| `storageKey?` | clé de persistance (permet de scoper les règles, ex. par conversation) | clé par défaut interne |

`rules.addRuleFromText(text, name?, origin?)` :

- `text` — la règle en texte, `prémisse => conclusion` (variables en majuscule comme `X`) ;
- `name?` — nom lisible optionnel de la règle ;
- `origin?` — origine de la règle : `'manual'` (défaut), `'induced'` ou `'document'`.

Retour : l'objet `Rule` créé, ou **`null`** si le texte n'a pas pu être interprété en règle valide.

`rules.applyAllRules()` est **asynchrone** et ne prend aucun argument ; elle applique les règles en chaînage avant jusqu'à saturation et renvoie une `Promise<number>` — le **nombre de faits dérivés** ajoutés.

## Texte & ingestion

### 9. Transformer de la prose en faits

```ts
import { NaturalParser } from '@damba/libxn';

const parsed = NaturalParser.parse('le chat est un animal');
if (parsed.kind === 'statement') {
  await kb.tell(parsed.s, parsed.p, parsed.o); // chat / est / animal
}
```

`NaturalParser.parse(text)` est **statique** et prend **un seul argument** : le texte brut. Retour : un objet discriminé par son champ `kind` —

- `'statement'` → `{ kind, s, p, o }` : une affirmation exploitable par `kb.tell` (cas du test `if` ci-dessus) ;
- `'what'` / `'yesno'` / `'list'` → une **question** (jamais à stocker) ;
- `'unknown'` → `{ kind, text }` : non interprété.

> 💡 Une **question** ne doit jamais devenir un fait : le `if (parsed.kind === 'statement')` est ce qui garantit qu'on n'enregistre que des affirmations.

### 10. Ingestion de texte + recherche plein-texte

```ts
await grid.processData('le chat dort sur le canapé');
await grid.processData('le chien court dans le jardin');

grid.findValuesContaining('chat'); // ['le chat dort sur le canapé']
```

`grid.processData(data, opts?)` est **asynchrone** : elle encode `data` (n'importe quel type) et l'ingère dans le graphe. `opts?` accepte `{ skipView?: boolean }` (défaut `{}`) — `skipView: true` saute le rafraîchissement du rendu. Retour : `Promise<void>`.

`grid.findValuesContaining(query, limit?)` :

- `query` — sous-chaîne à rechercher (insensible à la casse) ;
- `limit?` — nombre maximum de résultats (défaut **`10`**).

Retour : `string[]` — les valeurs stockées qui contiennent `query` (vide si `query` est vide).

## Apprentissage

### 11. Classification (apprendre par l'exemple)

```ts
import { BinaryConverter } from '@damba/libxn';
const enc = (row: object) => BinaryConverter.toBinaryPairs(row);

await grid.trainClass(enc({ surface: 120, pieces: 4 }), 'maison');
await grid.trainClass(enc({ surface: 35, pieces: 1 }), 'studio');

grid.predictClass(enc({ surface: 110, pieces: 4 })).label; // 'maison'
```

`BinaryConverter.toBinaryPairs(data)` est **statique** et prend **un seul argument** (`data`, n'importe quel primitif/tableau/objet). Retour : `[number, number][]` — la liste des paires de bits (« quats ») qui sert d'entrée à l'entraînement et à la prédiction.

`grid.trainClass(pairs, label)` est **asynchrone** :

- `pairs` — l'entrée encodée (`[number,number][]`) ;
- `label` — l'étiquette de classe associée à cet exemple.

Retour : `Promise<void>`.

`grid.predictClass(pairs)` prend l'entrée encodée et renvoie (de façon **synchrone**) un objet `{ label, probability, depth, samples, distribution }` : `label` (classe la plus probable, ou `undefined` si rien n'a été appris sur ce chemin), `probability` (sa proba), `depth` (profondeur atteinte), `samples` (nb d'exemples vus) et `distribution` (la répartition complète `{ label, count, probability }[]`).

### 12. Régression (prédire un nombre)

```ts
await grid.train(enc({ surface: 120, pieces: 4 }), 480000);
await grid.train(enc({ surface: 60, pieces: 2 }), 240000);

grid.predictNumeric(enc({ surface: 115, pieces: 4 })).value; // ~ prix estimé
```

`grid.train(pairs, target)` est **asynchrone** :

- `pairs` — l'entrée encodée (`[number,number][]`) ;
- `target` — la **valeur numérique** cible à apprendre pour cette entrée.

Retour : `Promise<void>`.

`grid.predictNumeric(pairs)` prend l'entrée encodée et renvoie (synchrone) un objet `{ value, depth, samples }` : `value` est le nombre estimé (ou `undefined` si aucun échantillon sur ce chemin), `depth` la profondeur atteinte, `samples` le nombre d'exemples agrégés.

### 13. Génération native (recombiner l'appris)

```ts
await grid.processData('bonjour ');
await grid.processData('bonsoir ');
grid.generate({ steps: 4 }).text; // suite de fragments réellement ingérés
```

`grid.generate(opts?)` prend **un seul argument**, un objet d'options (défaut `{}`) :

| Option | Rôle | Défaut |
|---|---|---|
| `seed?` | entrée de départ — si fournie, la génération démarre là où ce seed atterrit dans la grille (au lieu de la porte) | — (départ à la porte) |
| `steps?` | nombre d'items à émettre | `8` |
| `temperature?` | `1.0` = poids bruts ; `<1` = plus piqué sur les chemins fréquents ; `>1` = plus uniforme (planché à `0.001`) | `1.0` |

Retour : `{ text, items, path, stoppedEarly }` — `text` (les fragments concaténés), `items` (les valeurs émises), `path` (les nœuds traversés) et `stoppedEarly` (true si la marche s'est arrêtée avant `steps`).

## Persistance

### 14. Sauvegarder et restaurer le graphe

```ts
const snapshot = grid.serialize();
const restored = XNeuroneGrid.fromSnapshot(snapshot);
restored.countNodes(); // même graphe
```

`grid.serialize(opts?)` prend un objet d'options optionnel (défaut `{}`) : seule clé `lite?: boolean` (omet certaines données pour un snapshot plus léger). Retour : un `GridSnapshot` sérialisable (JSON).

`XNeuroneGrid.fromSnapshot(snapshot, encoder?)` est **statique** :

- `snapshot` — le `GridSnapshot` renvoyé par `serialize()` ;
- `encoder?` — encodeur à attacher à la grille reconstruite (défaut : l'encodeur par défaut).

Retour : une nouvelle `XNeuroneGrid` reconstruite. `grid.countNodes()` ne prend aucun argument et renvoie le `number` de neurones du graphe.

### 15. Persistance + recherche dans une base vectorielle

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));
await store.save('ma-kb', kb.grid.serialize());   // persiste
const snap = await store.load('ma-kb');            // recharge
```

`new QdrantVectorStore(url?)` prend **un seul argument** : `url`, l'URL du serveur Qdrant (défaut `'http://localhost:6333'`).

`new VectorGridStore(store)` prend **un seul argument** : le `VectorStore` sous-jacent (ici l'adaptateur Qdrant) — c'est lui qui persiste réellement.

- `store.save(key, snapshot)` — **asynchrone** ; `key` est la clé sous laquelle ranger le snapshot, `snapshot` est le `GridSnapshot` (de `grid.serialize()`). Retour : `Promise<void>`.
- `store.load(key)` — **asynchrone** ; renvoie une `Promise<GridSnapshot | null>` (**`null`** si la clé est absente, ou en cas de collision d'identifiant pour protéger contre un mauvais snapshot).

> La recherche sémantique (`searchSemantic`) se branche en fournissant un `TextEmbedder` — voir
> [Architecture](04-guides/architecture).

## Benchmark

### 16. Mesurer recall & latence

```ts
import { Benchmark } from '@damba/libxn';

const summary = await new Benchmark().runAll();
summary.globalRecall;   // 1  (100%)
summary.meanLatencyMs;  // ~0.08
```

`new Benchmark()` ne prend aucun argument. `benchmark.runAll(scenarios?)` est **asynchrone** :

- `scenarios?` — liste de scénarios à exécuter ; par défaut les scénarios intégrés (`BENCH_SCENARIOS`).

Retour : une `Promise<BenchSummary>` dont les champs clés sont `globalRecall` (taux de réussite global, `1` = 100 %), `meanLatencyMs` (latence moyenne par requête, en ms) et le détail par scénario dans `results`.
