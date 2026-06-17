# Composants clés

QPath s'utilise à travers quelques briques complémentaires, regroupées en quatre familles : **le socle**,
**la connaissance**, **le raisonnement**, et **la persistance & recherche**. Cette page explique **à quoi
sert chacune** et **dans quelle situation l'utiliser** — sans entrer dans le fonctionnement interne.

---

## Le socle

### XNeuroneGrid — le graphe

La **structure de base** : le graphe dans lequel toute donnée est stockée et retrouvée. La fondation sur
laquelle reposent tous les autres composants.

**À quoi ça sert :** ingérer n'importe quelle donnée, la retrouver exactement (ou la plus proche),
apprendre légèrement (classification, régression), persister tout le graphe.

**Quand l'utiliser :** dès que vous avez besoin d'une **mémoire adressable par contenu** — un magasin où
l'emplacement d'une donnée découle de la donnée elle-même, avec récupération déterministe.

```ts
import { XNeuroneGrid } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
await grid.processData('le chat dort');
grid.findValuesContaining('chat');     // retrouve par le contenu
const snap = grid.serialize();          // persistance
```

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

> Le choix de l'encodeur détermine **quelles entrées se ressemblent** pour le graphe. Règle d'or : le même
> encodeur à l'ingestion et à la requête.

---

## La connaissance

### KnowledgeBase — la couche de faits

S'appuie sur `XNeuroneGrid` pour stocker des **relations** sous forme de triplets *(sujet, prédicat,
objet)* plutôt que des données brutes.

**À quoi ça sert :** mémoriser des faits (« marc aime le chocolat »), interroger dans les deux sens, croiser
(intersections, unions, comparaison, similarité), et inférer (transitivité, héritage avec trace).

**Quand l'utiliser :** toute application qui a besoin d'une **couche de relations interrogeable** — profils,
catalogues, ontologies métier, mémoire d'un agent — sans déployer une base de données graphe dédiée.

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('marc', 'aime', 'chocolat');
kb.ask('marc', 'aime');              // ['chocolat']
kb.askInverse('aime', 'chocolat');   // ['marc']
```

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

- **Deux cycles de vie côte à côte** : marque `cascade` ce qui doit mourir avec le propriétaire
  (pièces, métadonnées techniques), laisse le reste indépendant (adresse, préférences).
- **Compagnon = fait ordinaire** : il reste interrogeable (`ask`, `compute`, `matchFacts`) et peut
  être **secret** (`FactVault.setSecret` puis `comp.tag`) ou rattaché à un **groupe d'accès** —
  `profileOf` ne révèle alors que ce que la session autorise.
- **Propriétaire-entité vs propriétaire-fait** : l'**entité** pour un profil durable d'une
  personne/chose ; le **fait** pour les métadonnées d'un énoncé précis (provenance, score, horodatage).

> **Pattern produit (Damba)** — toute **ingestion de document** (upload + extraction IA, dossier de
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

> Détails et garde-fous : voir [PingPong reasoning](pingpong-reasoning).

---

## Persistance & recherche

### VectorStore — brancher une base vectorielle (recherche par similarité)

Le port `VectorStore` connecte QPath à une base vectorielle pour la **recherche par similarité**
(par chemin ou par sens). Adaptateurs : `InMemoryVectorStore` (noyau, référence/hors-ligne),
`QdrantVectorStore` (`@damba/libxn-qdrant`), **pgvector** (backend Damba).

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
