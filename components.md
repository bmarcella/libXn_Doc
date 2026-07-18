# Composants clés

QPath s'utilise à travers quelques briques complémentaires, regroupées en quatre familles : **le socle**,
**la connaissance**, **le raisonnement**, et **la persistance & recherche**. Cette page explique **à quoi
sert chacune** et **dans quelle situation l'utiliser** — sans entrer dans le fonctionnement interne.

---

> 🎯 **Cas d'usage.** Vous démarrez un assistant et vous vous demandez « de quelles briques ai-je besoin ? ».
> Juste mémoriser et raisonner ? Le socle suffit. Piloter un LLM, persister en base, chercher par le sens,
> afficher en 3D ? On ajoute la brique correspondante. Le problème résolu : savoir **quoi installer pour
> quel besoin**, sans tout embarquer ni deviner.

## Le socle

### XNeuroneGrid — le graphe

La **structure de base** : le graphe dans lequel toute donnée est stockée et retrouvée. La fondation sur
laquelle reposent tous les autres composants.

**À quoi ça sert :** ingérer n'importe quelle donnée, la retrouver exactement (ou la plus proche),
apprendre légèrement (classification, régression), persister tout le graphe.

**Quand l'utiliser :** dès que vous avez besoin d'une **mémoire de faits déterministe** — récupération
exacte et reproductible (mêmes données, mêmes réponses), fiable à l'échelle.

```ts
import { XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
await grid.processData('le chat dort');
grid.findValuesContaining('chat');     // retrouve par le contenu
const snap = grid.serialize();          // persistance
```

**`new XNeuroneGrid(encoder?, opts?)`** — les deux arguments sont optionnels :

| Argument | Rôle | Défaut |
|---|---|---|
| `encoder?` | fonction qui transforme une donnée en paires de bits ; `undefined` = l'encodeur par défaut (`BinaryConverter.toBinaryPairs`) | `undefined` (encodeur par défaut) |
| `opts?` | `{ headless?: boolean }` — `headless: true` désactive tout rendu 3D (Node/serveur). Sans headless, la grille tente de créer une vue via `XNeuroneGrid.viewFactory` si elle est enregistrée | `{}` (donc `headless: false`) |

**`processData(data, opts?)`** — `data` est la donnée à ingérer (texte, nombre, objet — n'importe quel type) ; `opts?` = `{ skipView?: boolean }` (passer `true` pour ne pas redessiner la vue après l'ingestion). Renvoie une `Promise<void>`.

**`findValuesContaining(query, limit?)`** — `query` est le mot-clé recherché (insensible à la casse) ; `limit?` borne le nombre de résultats (défaut `10`). Renvoie un `string[]` : les **textes originaux ingérés** qui contiennent la requête (pas des triplets atomiques).

**`serialize(opts?)`** — `opts?` = `{ lite?: boolean }` ; `lite: true` ne sérialise que la **topologie** (sans les `value` des nœuds) pour alléger un gros snapshot de visualisation. Renvoie un `GridSnapshot` (objet `{ nodes, edges }`) prêt à persister.

> C'est la **source de vérité** : rapide, en mémoire, déterministe. Headless par défaut côté serveur ; un
> rendu 3D optionnel se branche via `@damba/libxn-visualization`.

### BinaryConverter — préparer les données

Le composant qui **transforme une donnée (texte, nombre, objet) en la représentation que le graphe
consomme**. C'est l'encodeur par défaut : il fait le pont entre vos valeurs et la structure interne.

**À quoi ça sert :** normaliser de façon **déterministe** n'importe quelle entrée avant de l'ingérer ou de
la rechercher dans le graphe. Mêmes données → même représentation, toujours.

**Quand l'utiliser :** la plupart du temps, c'est automatique (le graphe l'utilise par défaut). On le
manipule directement surtout pour l'apprentissage (préparer des exemples) ou pour des encodages sur mesure.

```ts
import { BinaryConverter, XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const sample = BinaryConverter.toBinaryPairs({ surface: 120, pieces: 4 });
await grid.trainClass(sample, 'maison');   // prépare un exemple pour l'apprentissage
```

- **`BinaryConverter.toBinaryPairs(data)`** (statique) — `data` est n'importe quelle valeur (primitive, tableau, objet) ; les clés d'objet sont **triées** pour que `{a,b}` et `{b,a}` produisent le même résultat (propriété adressable par contenu). Renvoie un `[number, number][]` (la liste de paires de bits, chacune `0` ou `1`).
- **`grid.trainClass(pairs, label)`** — `pairs` est la sortie de `toBinaryPairs` (l'exemple encodé) ; `label` est la **classe** (string) à associer à ce chemin. Renvoie une `Promise<void>`. C'est l'étape d'apprentissage : le label est stocké à la feuille atteinte et compté sur tous les ancêtres.

> Le choix de l'encodeur détermine **quelles entrées se ressemblent** pour le graphe. Règle d'or : le même
> encodeur à l'ingestion et à la requête.

---

## La connaissance

### KnowledgeBase — la couche de faits

S'appuie sur `XNeuroneGrid` pour stocker des **relations** sous forme de triplets *(sujet, prédicat,
objet)* plutôt que des données brutes.

**À quoi ça sert :** mémoriser des faits (« marc aime le chocolat »), interroger dans les deux sens, croiser
(intersections, unions, comparaison, similarité), et inférer (transitivité, héritage avec trace).

> **Lectures déterministes :** les requêtes (`ask`, `askInverse`, `allFacts`…) sont servies depuis des
> index miroir maintenus en parallèle de la grille — la réponse est **exacte et stable** quelle que soit
> la taille du corpus, indépendamment de la géométrie du substrat.

**Quand l'utiliser :** toute application qui a besoin d'une **couche de relations interrogeable** — profils,
catalogues, ontologies métier, mémoire d'un agent — sans déployer une base de données graphe dédiée.

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('marc', 'aime', 'chocolat');
kb.ask('marc', 'aime');              // ['chocolat']
kb.askInverse('aime', 'chocolat');   // ['marc']
```

**`new KnowledgeBase(grid)`** — un seul argument : la `XNeuroneGrid` qui sert de substrat. Si la grille est déjà peuplée (snapshot rechargé), les index miroir sont reconstruits au passage.

**`tell(s, p, o, source?, flags?)`** — enregistre un fait *(sujet, prédicat, objet)* :

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | le **sujet** | — (requis) |
| `p` | le **prédicat** (la relation) | — (requis) |
| `o` | l'**objet** (la valeur) | — (requis) |
| `source?` | la **provenance** du fait (`FactSource`) ; plusieurs `tell` du même fait accumulent leurs sources | `undefined` |
| `flags?` | drapeaux du fait (`FactFlags` : `closed`, `major`, `companionOf`…) | `undefined` |

Renvoie une `Promise<ContradictionReport | null>` : un rapport **non-null** si l'opposé exact (`p` ↔ `not_p`) existe déjà, sinon `null`.

**`ask(s, p)`** — `s` le sujet, `p` le prédicat ; renvoie le `string[]` des objets connus pour ce couple (lecture directe). **`askInverse(p, o)`** — la lecture inverse : `p` le prédicat, `o` l'objet ; renvoie le `string[]` des sujets `s` tels que *(s, p, o)*.

> Lectures **fiables et déterministes**, mémoire **éditable et auditable**.

### QPathKeyIndex — recall flou par préfixe

Un index de **recall flou** sur les clés (les sujets de la KnowledgeBase) : là où une table de hachage ne
sait faire qu'un lookup **exact**, cet index exploite le fait que QPath encode chaque clé en **chemin**, si
bien que deux clés au même préfixe d'octets partagent un préfixe de chemin.

**À quoi ça sert :** retrouver des clés **proches** sans tout balayer — voisins au plus long préfixe
partagé, requête de plage par préfixe, ou similarité par position.

**Quand l'utiliser :** résolution approchée d'un nom (variante, faute de frappe), navigation de clés
scopées (`user:<id>:<champ>`), suggestions — chaque fois que l'exact ne suffit pas. Câblé dans la
`KnowledgeBase` via `nearestSubjects` / `subjectsWithPrefix`.

```ts
kb.nearestSubjects('alicia');     // sujets connus au plus long préfixe partagé, du plus proche au moins
kb.subjectsWithPrefix('user:42'); // toutes les clés scopées sous ce préfixe (requête de plage)
```

- **`kb.nearestSubjects(s, limit?)`** — `s` est la clé de référence ; `limit?` borne le nombre de voisins renvoyés (défaut `5`). Renvoie un `KeyHit[]`, c.-à-d. `{ key: string; sharedDepth: number }[]` (la clé voisine + la **profondeur de préfixe de chemin partagé**, en quats), trié du plus proche au moins proche, `s` inclus s'il est connu.
- **`kb.subjectsWithPrefix(prefix)`** — un seul argument, le préfixe de clé ; renvoie le `string[]` de tous les sujets dont le nom (normalisé) commence par ce préfixe — requête de plage, **zéro balayage**.

> La même représentation de chemin sert l'exact ET l'approché. Le coût d'une recherche par préfixe reste
> quasi plat quand le nombre de clés grandit (sous-linéaire), là où un balayage croît linéairement. La
> similarité **par position** (tolère une différence au milieu de la clé) balaie en revanche le jeu de
> clés : à réserver aux ensembles raisonnables ou en second étage après un filtrage par préfixe.

### CompanionFacts — des faits qui en accompagnent un autre

Rattacher à un **propriétaire** un bloc de faits qui le décrivent : le **profil** d'une personne
autour de son compte (adresse, sexe, date de naissance…), les métadonnées d'un document, etc. Le
propriétaire est soit une **entité** (un sujet), soit un **fait précis** (un triplet).

```ts
import { CompanionFacts } from '@damba/libxn';
const comp = new CompanionFacts(kb);

// Profil d'une personne (propriétaire = entité)
const owner = { entity: 'bigvai' };
await comp.attach(owner, 'bigvai', 'adresse', 'port-au-prince');
await comp.attach(owner, 'bigvai', 'né_le', '1991-01-01', { cascade: true });
comp.profileOf(owner);     // { adresse:['port-au-prince'], 'né_le':['1991-01-01'] }

// Métadonnées d'un fait précis (propriétaire = triplet)
const f = { fact: { s: 'bigvai', p: 'a', o: 'compte_12345' } };
await comp.attach(f, 'compte_12345', 'ouvert_le', '2020-06-01', { cascade: true });

// Cycle de vie configurable : `cascade` → le compagnon part avec son propriétaire (archivé)
comp.retractOwner(f);      // rétracte le fait + ses compagnons cascade
```

**`new CompanionFacts(kb)`** — un seul argument : la `KnowledgeBase` sur laquelle s'appuyer.

Le **propriétaire** (`owner`) commun à toutes ces méthodes est un `CompanionOwner` : soit `{ entity: '<sujet>' }` (une entité), soit `{ fact: { s, p, o } }` (un triplet précis).

**`attach(owner, s, p, o, opts?)`** — écrit le fait *(s, p, o)* **et** le rattache à `owner` en un appel :

| Argument | Rôle | Défaut |
|---|---|---|
| `owner` | le propriétaire (`{ entity }` ou `{ fact }`) | — (requis) |
| `s`, `p`, `o` | le fait compagnon à écrire | — (requis) |
| `opts?` | `{ cascade?: boolean; source?: FactSource }` — `cascade: true` lie le cycle de vie du compagnon à celui du propriétaire ; `source` = provenance | `{}` (donc `cascade: false`, source `user`/`companion`) |

Renvoie une `Promise<string>` : l'**id** du fait compagnon créé.

**`tag(owner, s, p, o, opts?)`** — variante **synchrone** d'`attach` pour un fait **déjà existant** (ne l'écrit pas, le marque seulement comme compagnon) ; mêmes arguments, renvoie `void`.

**`profileOf(owner)`** — un seul argument ; renvoie un `Record<string, string[]>`, c.-à-d. `{ prédicat: [valeurs] }` agrégé sur tous les compagnons (alias d'entité fusionnés inclus). **`companionsOf(owner)`** renvoie la liste brute des faits compagnons (`EnumeratedFact[]`).

**`retractOwner(owner, reason?)`** — `reason?` est le motif d'archivage (défaut `'owner retracted'`). Rétracte (archive) le propriétaire et ses compagnons **directs** marqués `cascade`, **sur un seul niveau**. Renvoie `{ retracted: number }` (le nombre de faits rétractés).

> Les compagnons restent des **faits ordinaires** (interrogeables normalement) ; ils sont juste
> tagués vers leur propriétaire. `cascade` lie leur cycle de vie ; sans lui, ils sont indépendants.
>
> Cohérent avec l'identité : fusionner deux entités (`mergeEntities`) garde **un seul** profil (les
> lectures suivent les alias), et scinder un fait (`splitEntity`) **re-lie** ses compagnons au nouvel id.

**Imbrication & suppression d'arbre.** Un compagnon peut **lui-même** être propriétaire d'autres
compagnons (tout fait est un propriétaire valide) → des **arbres** de compagnons, profondeur illimitée.
`retractOwner` ne cascade que d'**un niveau** ; **`retractTree`** descend **tout l'arbre** — en ne
suivant que les compagnons `cascade` (un compagnon non-`cascade` ancre une branche conservée).

```ts
const owner = { entity: 'doc' };
await comp.attach(owner, 'doc', 'page', '3', { cascade: true });                       // P, compagnon de doc
await comp.attach({ fact: { s: 'doc', p: 'page', o: '3' } }, 'note', 'txt', '…', { cascade: true }); // compagnon de P

comp.retractOwner(owner);   // compagnons DIRECTS seulement (un niveau) → 'note' reste orpheline
comp.retractTree(owner);    // tout l'arbre : compagnon d'un compagnon, etc.
```

**`retractTree(owner, reason?)`** — même signature que `retractOwner` (`reason?` défaut `'owner tree retracted'`), mais **récursif** : descend tout l'arbre des compagnons en ne suivant que les liens `cascade` (un compagnon non-`cascade` ancre une branche conservée avec son sous-arbre). Sûr contre les cycles. Renvoie aussi `{ retracted: number }`.

**Cas d'usage avancés**

```ts
// 1) KYC bancaire — DEUX cycles de vie sous le même propriétaire
const client = { entity: 'bigvai' };
await comp.attach(client, 'bigvai', 'adresse', 'port-au-prince');                      // survit (non cascade)
await comp.attach(client, 'bigvai', 'pièce_identité', 'cin-4421', { cascade: true });  // périssable
// → purger le dossier KYC retire la pièce, GARDE l'adresse.

// 2) Métadonnées d'un document ingéré (propriétaire = un fait précis)
const doc = { fact: { s: 'doc_42', p: 'est', o: 'document' } };
await comp.attach(doc, 'doc_42', 'sha256', 'a1b2…', { cascade: true });
await comp.attach(doc, 'doc_42', 'ingéré_le', '2026-06-13', { cascade: true });
comp.retractOwner(doc);   // purge le document ET toutes ses métadonnées d'un coup

// 3) Le profil SURVIT à une fusion d'identités
await kb.mergeEntities('bob', 'robert');
comp.profileOf({ entity: 'robert' });   // renvoie le profil de bob — un seul, sans rien re-taguer
```

- **`kb.mergeEntities(a, b, source?)`** — fusionne deux entités en alias l'une de l'autre : `a` et `b` les deux noms, `source?` la provenance optionnelle. Renvoie une `Promise<boolean>` (`true` si la fusion a eu lieu). Après fusion, les lectures suivent les alias — d'où le profil unique.

- **Deux cycles de vie côte à côte** : marque `cascade` ce qui doit mourir avec le propriétaire
  (pièces, métadonnées techniques), laisse le reste indépendant (adresse, préférences).
- **Compagnon = fait ordinaire** : il reste interrogeable (`ask`, `compute`, `matchFacts`) et peut
  être **secret** (`FactVault.setSecret` puis `comp.tag`) ou rattaché à un **groupe d'accès** —
  `profileOf` ne révèle alors que ce que la session autorise.
- **Propriétaire-entité vs propriétaire-fait** : l'**entité** pour un profil durable d'une
  personne/chose ; le **fait** pour les métadonnées d'un énoncé précis (provenance, score, horodatage).

> **Pattern produit (QPath)** — toute **ingestion de document** (upload + extraction IA, dossier de
> connaissances, synthèse de recherche) rattache chaque fait extrait au document, propriétaire-entité
> `document:<nom>`, en `cascade: true` :
> ```ts
> const comp = new CompanionFacts(kb);
> comp.tag({ entity: 'document:cv.pdf' }, 'bigvai', 'ville', 'paris', { cascade: true });
> comp.companionsOf({ entity: 'document:cv.pdf' }); // tous les faits de CE document = une « section »
> ```
> Résultat : les faits d'un document forment une **section interrogeable** et **cascadent** si le
> document est rétracté — sans cesser d'être des faits ordinaires (interrogeables, agrégeables).


### NaturalParser — du langage aux faits

Le **pont entre le texte libre et la KnowledgeBase** : il transforme une phrase en langage naturel en un
fait structuré prêt à être mémorisé.

**À quoi ça sert :** lire une phrase simple (FR/EN), en extraire la relation, distinguer un énoncé
exploitable d'une question ou d'une phrase vague, et alimenter la KB sans écrire de triplets à la main.

**Quand l'utiliser :** pour **ingérer de la connaissance écrite** — notes, documents, résultats d'une
recherche web, messages utilisateur. La porte d'entrée naturelle vers la mémoire QPath.

```ts
import { NaturalParser } from '@damba/libxn';

const parsed = NaturalParser.parse('le chat est un animal');
if (parsed.kind === 'statement') {
  await kb.tell(parsed.s, parsed.p, parsed.o);   // chat / est / animal
}
```

**`NaturalParser.parse(text)`** (statique) — un seul argument, la phrase à analyser. Renvoie un `ParsedInput`, **union discriminée** par le champ `kind` :

| `kind` | Champs | Signification |
|---|---|---|
| `'statement'` | `s`, `p`, `o` | énoncé exploitable → à mémoriser via `kb.tell` |
| `'what'` | `s`, `p` | question ouverte (« quelle est la… ») — ne rien stocker |
| `'yesno'` | `s`, `p`, `o` | question oui/non — ne rien stocker |
| `'list'` | `p`, `o` | demande de liste — ne rien stocker |
| `'unknown'` | `text` | rien d'exploitable (phrase vague/conversationnelle) |

> 💡 **Toujours tester `parsed.kind === 'statement'`** avant d'écrire : seul ce cas porte un triplet à mémoriser ; tous les autres sont des questions ou du bruit que le parseur refuse d'affirmer.

Le parseur va bien au-delà du « X est Y » scolaire :

```ts
// Relations naturelles : le prédicat porte la relation entière (plus de snake_case à taper)
NaturalParser.parse('Alice est la mère de Bob');   // → { s:'alice', p:'mère_de', o:'bob' }
NaturalParser.parse('Paris est la capitale de la France'); // → { s:'paris', p:'capitale_de', o:'france' }

// Négation → prédicat not_<p>
NaturalParser.parse('le pingouin ne vole pas');    // → { s:'pingouin', p:'not_vole', o:'…' }

// Plusieurs faits dans un message (parseAll)
NaturalParser.parseAll('Alice est la mère de Bob. Bob est le père de Carl');
// → [ {s:'alice',p:'mère_de',o:'bob'}, {s:'bob',p:'père_de',o:'carl'} ]
```

**`NaturalParser.parseAll(text)`** (statique) — un seul argument, un message pouvant contenir **plusieurs phrases**. Découpe le texte, ne garde que les énoncés (`kind: 'statement'`) et renvoie directement un `Array<{ s, p, o }>` — donc déjà filtré des questions, prêt à boucler sur `kb.tell`.

> Parseur **permissif et prudent** : il distingue un énoncé d'une **question** (« quel chien… »,
> même sans « ? ») et d'une **réplique** (« je pense que… ») — qu'il ne mémorise pas. En cas de
> doute, il préfère ne rien affirmer plutôt qu'inventer.

### NaturalRuleParser — du langage aux règles

Le pendant de `NaturalParser` pour les **règles** : il transforme une phrase conditionnelle en
**DSL de règle** prêt pour `RuleEngine.addRuleFromText` (via `RuleFactory.refine`).

**À quoi ça sert :** laisser un humain écrire une règle en clair, sans connaître la syntaxe `=>`.

**Quand l'utiliser :** dans une saisie de connaissances, pour proposer une règle à **valider**.

```ts
import { NaturalRuleParser } from '@damba/libxn';

NaturalRuleParser.parse('Si une personne est majeure alors elle peut voter');
// → { dsl: 'X est majeure => X peut voter', conditions:[…], conclusions:[…] }

NaturalRuleParser.parse('Tout humain a deux jambes');   // universelle
// → { dsl: 'X est humain => X a deux_jambes', … }
```

**`NaturalRuleParser.parse(text)`** (statique) — un seul argument, la phrase conditionnelle. Renvoie un `ParsedRuleNL | null` :
- `dsl` — la règle normalisée (`'condition => conclusion'`), prête pour `RuleEngine.addRuleFromText` / `RuleFactory.refine` ;
- `conditions` / `conclusions` — `Array<{ s, p, o }>`, les triplets de chaque côté de la flèche.

Renvoie **`null`** si la structure est ambiguë ou s'il n'y a pas de variable partagée condition↔conclusion (ce n'est alors pas une vraie règle générale).

Reconnaît « **si … alors …** » / « if … then … », la **flèche** (`=>`/`⇒`/`→`) et l'**universelle**
« tout/chaque ‹classe› … ». Gère FR/EN, la **négation** (`ne … pas` → `not_*`), les **relations**
(« la mère de X » → `mère_de`) et la **coréférence pronominale** (il/elle/they → la variable `X`).

> **Conservateur** : renvoie `null` si la structure est ambiguë ou s'il n'y a **pas de variable
> partagée** condition↔conclusion (ce n'est alors pas une vraie règle générale). Comme le
> `NaturalParser`, il préfère ne rien proposer plutôt que d'inventer — la décision finale revient à
> `RuleFactory` puis à l'humain qui valide.

---

## Le raisonnement

### ChainResolver — enchaîner les faits

Le moteur de **raisonnement par chaînage arrière** : à partir des faits connus, il trouve une **chaîne**
qui mène à une conclusion, et en fournit la **trace**.

**À quoi ça sert :** répondre à « pourquoi / comment en arrive-t-on à… » en reliant plusieurs faits (ex.
*socrate est humain → humain est mortel → mortel a une fin*), avec une explication lisible.

**Quand l'utiliser :** quand la réponse n'est pas un fait direct mais le **résultat d'une déduction**, et
surtout quand il faut **montrer le cheminement** (santé, finance, juridique, conformité).

```ts
import { ChainResolver } from '@damba/libxn';

const chain = new ChainResolver(kb).chain('socrate', 'a');
ChainResolver.format(chain!);
// → "socrate —est→ humain —est→ mortel —a→ fin  (⇒ a = fin, confiance 1.00, via transitive)"
```

**`new ChainResolver(kb, algebra?)`** — `kb` la `KnowledgeBase` ; `algebra?` une `PredicateAlgebra` (les règles de composition des prédicats), par défaut `PredicateAlgebra.withDefaults()`.

**`chain(s, targetP, opts?)`** — cherche la chaîne la plus courte (BFS) reliant `s` à un objet via le prédicat composé `targetP` :

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | le **sujet** de départ | — (requis) |
| `targetP` | le **prédicat cible** à atteindre par composition | — (requis) |
| `opts?` | `{ maxDepth?: number; confidence?: 'min' \| 'product' }` — profondeur max de la chaîne (défaut `4`) et politique d'agrégation de confiance (`'min'` = maillon le plus faible, défaut ; `'product'` = composition probabiliste) | `{}` |

Renvoie une `ReasoningChain | null` (`null` si aucune chaîne valide) — d'où le `chain!` avant `format`.

**`ChainResolver.format(chain)`** (statique) — un seul argument, une `ReasoningChain` (non-null) ; renvoie la `string` lisible montrée en commentaire.

> **Paresseux** : calcule à la demande, à la requête, sans rien stocker. Déterministe et traçable.

### RuleEngine — déduire de nouveaux faits

Le moteur de **chaînage avant** : on déclare des règles métier, et chaque nouveau fait **déclenche** les
règles pour produire des faits dérivés (avec leur provenance).

**À quoi ça sert :** matérialiser à l'avance des conséquences (« qui utilise TypeScript comprend
JavaScript »), appliquer des politiques, enrichir automatiquement la base.

**Quand l'utiliser :** quand vous avez des **règles métier explicites** et voulez que la base se complète
toute seule au fil des ajouts — moteurs de règles, politiques d'accès, scoring, workflows conditionnels.

```ts
import { RuleEngine } from '@damba/libxn';

const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X utilise typescript => X comprend javascript');
await rules.applyAllRules();
kb.askInverse('comprend', 'javascript');   // inclut les faits déduits
```

**`new RuleEngine(kb, persistent?, store?, storageKey?)`** :

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la `KnowledgeBase` à enrichir | — (requis) |
| `persistent?` | charge/sauve les règles dans le `store` (`false` = règles en mémoire seule, comme ici) | `true` |
| `store?` | le `KeyValueStore` de persistance des règles | `new MemoryStore()` |
| `storageKey?` | clé de persistance (permet de scoper les règles, ex. par conversation) | clé par défaut |

**`addRuleFromText(text, name?, origin?)`** — `text` la règle en DSL (`'condition => conclusion'`) ; `name?` un nom optionnel ; `origin?` ∈ `'manual' | 'induced' | 'document'` (défaut `'manual'`). Renvoie la `Rule` créée, ou **`null`** si le DSL est rejeté (motif dans `rules.lastRefineError`).

**`applyAllRules()`** — sans argument ; applique le chaînage avant sur toute la base et renvoie une `Promise<number>` (le nombre de faits dérivés produits).

> **Dual du ChainResolver** : `RuleEngine` anticipe (à l'écriture), `ChainResolver` calcule à la demande
> (à la requête). Les deux peuvent partager les mêmes règles.
>
> **Maintenance de vérité.** Rétracter un fait peut **recalculer les conséquences dérivées** : un fait
> déduit d'une prémisse disparue ne subsiste pas — la base reste cohérente, sans dérivés orphelins.

### PingPongReasoner — raisonner avec un LLM, ancré sur QPath

Un raisonnement par **échange court et alterné entre QPath et un LLM** : le LLM avance pas à pas, QPath
**valide chaque pas** (anti-hallucination) et la mémoire grandit au fil de l'échange.

**À quoi ça sert :** résoudre des questions **ouvertes ou multi-étapes** que QPath seul ne conclut pas,
sans laisser le LLM inventer — chaque affirmation est confrontée à QPath.

**Quand l'utiliser :** quand `ChainResolver` ne suffit pas mais que **chaque étape** vers la réponse est
vérifiable par QPath. Le LLM est fourni via un port (`LlmPort`), donc indépendant du fournisseur.

```ts
import { PingPongReasoner } from '@damba/libxn';
const result = await new PingPongReasoner(kb, llm).run('Alice est-elle ancêtre de Diana ?', { seedSubject: 'alice' });
result.conclusion;   // réponse ancrée ; result.transcript = l'échange complet
```

**`new PingPongReasoner(kb, llm, opts?)`** — `kb` la `KnowledgeBase` (l'ancrage), `llm` un `LlmPort` (le fournisseur, mockable), `opts?` des réglages par défaut `{ algebra?, maxRounds?, writeBack?, confidence?, tools? }`.

**`run(question, opts?)`** — lance l'échange borné :

| Option (`opts?`) | Rôle | Défaut |
|---|---|---|
| `maxRounds?` | nombre maximum d'échanges | `3` |
| `writeBack?` | réinjecter dans la KB les hypothèses vérifiées | `true` |
| `confidence?` | politique de confiance passée à `ChainResolver` (`'min'`/`'product'`) | héritée du constructeur |
| `seedSubject?` | sujet de départ : ses faits connus amorcent le LLM | `undefined` |
| `systemPrompt?` | prompt système transmis au LLM à chaque round | `PINGPONG_SYSTEM_RULES` |

Renvoie une `Promise<PingPongResult>` dont les champs clés sont `conclusion` (la réponse ancrée), `transcript` (l'échange complet lisible), `rounds`, `factsLearned`, `grounded` (`true` = chaque affirmation a été confrontée à QPath) et `stopped` (`'concluded' | 'maxRounds' | 'stalled'`).

> Détails et garde-fous : voir [PingPong reasoning](pingpong-reasoning).

---

## Persistance & recherche

### VectorStore — brancher une base vectorielle (recherche par similarité)

Le port `VectorStore` connecte QPath à une base vectorielle pour la **recherche par similarité**
(par chemin ou par sens). Adaptateurs : `InMemoryVectorStore` (noyau, référence/hors-ligne),
`QdrantVectorStore` (`@damba/libxn-qdrant`), **pgvector** (backend QPath).

**À quoi ça sert :** retrouver les éléments **les plus proches** d'une requête — au-delà de la
correspondance exacte (recommandation, « éléments similaires », rapprochement).

> Pour la **persistance durable des faits**, c'est la couche dédiée qui s'en charge
> (`KbStore` / `FactStore` / `DurableKnowledgeBase`) — voir [Persistance](/persistence). La base
> vectorielle, elle, sert la recherche sémantique ; les deux sont orthogonales.

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));
await store.save('ma-kb', kb.grid.serialize());     // persiste
const hits = await store.searchSimilarPaths('ma-kb', queryPath, 5);
```

- **`new QdrantVectorStore(url?)`** — un seul argument, l'URL du serveur Qdrant (défaut `'http://localhost:6333'`). C'est l'**adaptateur** concret ; il implémente l'interface `VectorStore`.
- **`new VectorGridStore(store)`** — un seul argument : n'importe quel adaptateur `VectorStore` (Qdrant, pgvector, en mémoire…). La façade ne dépend que de l'interface.
- **`store.save(key, snapshot)`** — `key` le scope/collection, `snapshot` un `GridSnapshot` (sortie de `kb.grid.serialize()`). Renvoie une `Promise<void>`.
- **`store.searchSimilarPaths(key, queryPath, limit?)`** — `key` le scope, `queryPath` le chemin requête (`Direction[]`), `limit?` le nombre de voisins (défaut `10`). Renvoie une `Promise<Array<{ id, score, value, classCounts }>>` : les feuilles les plus proches, avec leur **score** de similarité, la `value` ingérée et les `classCounts`.

> QPath ne dépend d'**aucune** base vectorielle en particulier : Qdrant n'est qu'un adaptateur. Pour
> pgvector, Pinecone, un store en mémoire… on fournit un autre adaptateur, **le noyau ne change pas**
> (voir [Architecture](04-guides/architecture)).

---

## Comment ils s'articulent

```
                 BinaryConverter         ChainResolver / RuleEngine
              (prépare les données)        (raisonnent sur les faits)
                       │                            │
   texte libre ─▶ NaturalParser ─▶ KnowledgeBase ─▶ XNeuroneGrid ─▶ VectorStore
                 (langage→fait)    (faits & requêtes)  (le graphe, socle)   (recherche similarité)
                                          │
                                   KbStore / FactStore (persistance durable — cf. Persistance)
```

`XNeuroneGrid` est le socle ; `BinaryConverter` y fait entrer les données ; `KnowledgeBase` et
`NaturalParser` y ajoutent le sens ; `ChainResolver` et `RuleEngine` raisonnent par-dessus ; un
adaptateur `VectorStore` (pgvector, Qdrant…) assure la recherche par similarité, et la couche
[Persistance](/persistence) (`DurableKnowledgeBase`) la durabilité des faits.

::: tip
Le fonctionnement interne de ces composants (encodage, indexation, algorithme) n'est pas documenté
publiquement. Pour un accès technique ou un partenariat, contactez l'auteur.
:::
