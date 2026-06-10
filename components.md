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

> Parseur **permissif et prudent** : en cas de doute, il préfère ne rien affirmer plutôt qu'inventer.

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
// → "socrate —est→ humain —est→ mortel —a→ fin  (⇒ a = fin, confiance 1.00)"
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

### QdrantVectorStore — brancher une base vectorielle

L'**adaptateur** (paquet `@damba/libxn-qdrant`) qui connecte QPath à une base vectorielle **Qdrant** :
pour persister durablement et faire de la **recherche par similarité** (par chemin ou par sens).

**À quoi ça sert :** sauvegarder/recharger une mémoire QPath au-delà de la session, et retrouver les
éléments **les plus proches** d'une requête — au-delà de la correspondance exacte.

**Quand l'utiliser :** dès qu'il faut de la **persistance durable** ou de la **recherche floue/sémantique**
à grande échelle (recommandation, « éléments similaires », rapprochement).

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
   texte libre ─▶ NaturalParser ─▶ KnowledgeBase ─▶ XNeuroneGrid ─▶ QdrantVectorStore
                 (langage→fait)    (faits & requêtes)  (le graphe, socle)   (persistance & recherche)
```

`XNeuroneGrid` est le socle ; `BinaryConverter` y fait entrer les données ; `KnowledgeBase` et
`NaturalParser` y ajoutent le sens ; `ChainResolver` et `RuleEngine` raisonnent par-dessus ;
`QdrantVectorStore` assure la persistance durable et la recherche par similarité.

::: tip
Le fonctionnement interne de ces composants (encodage, indexation, algorithme) n'est pas documenté
publiquement. Pour un accès technique ou un partenariat, contactez l'auteur.
:::
