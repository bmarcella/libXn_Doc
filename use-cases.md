# Cas d'usage

QPath est une **mémoire de faits + un moteur de raisonnement** dans une seule structure : déterministe,
à 0 token, exécutable partout (Node, navigateur, Web Worker). Voici où ça brille — et comment l'intégrer.

## 1. Mémoire pour agents / assistants IA

**Le problème.** Un agent LLM « oublie » entre les tours, re-paie des tokens pour re-fournir le contexte,
et peut halluciner ses propres souvenirs.

**Avec QPath.** L'agent écrit ses faits dans QPath et les relit de façon déterministe, à 0 token.

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';
const memory = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

// l'agent mémorise au fil de la conversation
await memory.tell('utilisateur', 'préfère', 'le thé');
await memory.tell('projet-x', 'utilise', 'typescript');

// puis relit, sans aucun appel modèle
memory.ask('utilisateur', 'préfère');        // ['le thé']
memory.askInverse('utilise', 'typescript');  // ['projet-x']
```

**Comment l'intégrer.** Avant de répondre, l'agent interroge QPath pour son contexte ; après, il y écrit
les nouveaux faits. La mémoire reste **auditable et corrigeable** — on peut lire et éditer ce qu'il sait.

## 2. Graphe de connaissances applicatif (sans base graphe)

**Le problème.** Beaucoup d'apps ont besoin d'une couche de relations interrogeable, mais déployer une
base graphe (Neo4j…) est lourd.

**Avec QPath.** Des triplets `(sujet, prédicat, objet)`, requêtes directes/inverses, intersections.

```ts
await kb.tell('marc', 'aime', 'chocolat');
await kb.tell('julie', 'aime', 'chocolat');
await kb.tell('marc', 'habite', 'montreal');

kb.askInverse('aime', 'chocolat');                            // ['marc', 'julie']
kb.askIntersect([['aime', 'chocolat'], ['habite', 'montreal']]); // ['marc']
```

**Domaines.** Catalogues produits, profils utilisateurs, ontologies métier, CRM léger, moteurs de FAQ.

## 3. Recommandation & similarité

```ts
kb.askSimilar('marc', 3).map(r => r.subject);  // les sujets les plus proches de 'marc'
kb.askCompare('marc', 'julie');                // facts communs + distinctifs
```

**Domaines.** « Profils similaires », « produits proches », rapprochement de dossiers, matching.

## 4. Raisonnement explicable (santé, finance, juridique, conformité)

**Le problème.** Dans les domaines régulés, une réponse doit être **justifiable** — pas une boîte noire.

**Avec QPath.** Le raisonnement produit une **trace lisible et déterministe**.

```ts
import { ChainResolver } from '@damba/libxn';
await kb.tell('dossier-42', 'est', 'résident');
await kb.tell('résident', 'a_droit', 'prestation-A');

const chain = new ChainResolver(kb).chain('dossier-42', 'a_droit');
ChainResolver.format(chain!);
// → "dossier-42 —est→ résident —a_droit→ prestation-A  (⇒ a_droit = prestation-A, confiance 1.00)"
```

**Domaines.** Éligibilité (assurance, prestations sociales), conformité, aide à la décision médicale,
raisonnement juridique — partout où il faut montrer **pourquoi**.

## 5. Règles métier & faits dérivés

```ts
import { RuleEngine } from '@damba/libxn';
const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X utilise typescript => X comprend javascript');
await rules.applyAllRules();

kb.askInverse('comprend', 'javascript'); // inclut tous les utilisateurs de TS (fait dérivé)
```

**Domaines.** Moteurs de règles, politiques d'accès, workflows conditionnels, scoring de risque.

## 6. IA embarquée, offline & souveraine

QPath est **isomorphe et sans dépendance** : il tourne dans le navigateur, en Node, dans un Web Worker.
Aucune donnée ne sort, aucun appel réseau, aucun coût par requête.

**Domaines.** Apps mobiles/desktop offline, secteurs sensibles (données privées qui ne doivent pas
quitter l'appareil), edge computing, extensions navigateur.

## 7. Classification & scoring légers

Le graphe apprend de quelques exemples et prédit — sans pipeline d'entraînement ni GPU.

```ts
import { BinaryConverter } from '@damba/libxn';
const grid = new XNeuroneGrid(undefined, { headless: true });

await grid.trainClass(BinaryConverter.toBinaryPairs({ surface: 120, pieces: 4 }), 'maison');
await grid.trainClass(BinaryConverter.toBinaryPairs({ surface: 35, pieces: 1 }), 'studio');

grid.predictClass(BinaryConverter.toBinaryPairs({ surface: 110, pieces: 4 })).label; // 'maison'
```

**Domaines.** Tri/étiquetage rapide, scoring embarqué, prototypage ML sans infrastructure.

---

::: tip Aller plus loin
Recherche vectorielle (Qdrant ou autre base) via `@damba/libxn-qdrant`, visualisation 3D du graphe via
`@damba/libxn-visualization`. Voir [Architecture](04-guides/architecture).
:::
