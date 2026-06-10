# Exemples

Un recueil de recettes courtes et concrètes. Tous les exemples utilisent l'API publique de
`@damba/libxn`. Pour des scénarios par métier, voir [Cas d'usage](use-cases).

## Mise en place

```ts
import { XNeuroneGrid, KnowledgeBase } from '@damba/libxn';

const grid = new XNeuroneGrid(undefined, { headless: true });
const kb = new KnowledgeBase(grid);
```

## Mémoire & faits

### 1. Stocker et lire des faits

```ts
await kb.tell('marc', 'aime', 'chocolat');
await kb.tell('marc', 'habite', 'montreal');

kb.ask('marc', 'aime');              // ['chocolat']
kb.askInverse('aime', 'chocolat');   // ['marc']  (qui aime le chocolat ?)
```

### 2. Requêtes ensemblistes (intersection / union)

```ts
await kb.tell('julie', 'aime', 'chocolat');
await kb.tell('julie', 'habite', 'montreal');

kb.askIntersect([['aime', 'chocolat'], ['habite', 'montreal']]); // ['marc', 'julie']
kb.askUnion([['aime', 'chocolat'], ['habite', 'paris']]);        // tous ceux qui matchent l'un OU l'autre
```

### 3. Comparer deux sujets

```ts
const cmp = kb.askCompare('marc', 'julie');
cmp.common;   // facts identiques (ex. aime=chocolat, habite=montreal)
cmp.onlyIn1;  // propres à marc
cmp.onlyIn2;  // propres à julie
```

### 4. Similarité

```ts
kb.askSimilar('marc', 3).map(r => r.subject); // les 3 sujets les plus proches de 'marc'
```

## Raisonnement

### 5. Chaîne de raisonnement + trace lisible

```ts
import { ChainResolver } from '@damba/libxn';

await kb.tell('socrate', 'est', 'humain');
await kb.tell('humain', 'est', 'mortel');
await kb.tell('mortel', 'a', 'fin');

const chain = new ChainResolver(kb).chain('socrate', 'a');
ChainResolver.format(chain!);
// → "socrate —est→ humain —est→ mortel —a→ fin  (⇒ a = fin, confiance 1.00)"
```

### 6. Toutes les conclusions possibles

```ts
const resolver = new ChainResolver(kb);
resolver.chainAll('socrate', 'est').map(c => c.conclusion.o); // ['humain', 'mortel', ...]
```

### 7. Vérifier un fait dérivé (vrai / faux)

```ts
resolver.verifyChain('socrate', 'a', 'fin');     // true
resolver.verifyChain('socrate', 'a', 'plumes');  // false
```

### 8. Règles métier → faits dérivés

```ts
import { RuleEngine } from '@damba/libxn';

const rules = new RuleEngine(kb, false);
rules.addRuleFromText('X utilise typescript => X comprend javascript');
await rules.applyAllRules();

kb.askInverse('comprend', 'javascript'); // tous les utilisateurs de TS (déduit)
```

## Texte & ingestion

### 9. Transformer de la prose en faits

```ts
import { NaturalParser } from '@damba/libxn';

const parsed = NaturalParser.parse('le chat est un animal');
if (parsed.kind === 'statement') {
  await kb.tell(parsed.s, parsed.p, parsed.o); // chat / est / animal
}
```

### 10. Ingestion de texte + recherche plein-texte

```ts
await grid.processData('le chat dort sur le canapé');
await grid.processData('le chien court dans le jardin');

grid.findValuesContaining('chat'); // ['le chat dort sur le canapé']
```

## Apprentissage

### 11. Classification (apprendre par l'exemple)

```ts
import { BinaryConverter } from '@damba/libxn';
const enc = (row: object) => BinaryConverter.toBinaryPairs(row);

await grid.trainClass(enc({ surface: 120, pieces: 4 }), 'maison');
await grid.trainClass(enc({ surface: 35, pieces: 1 }), 'studio');

grid.predictClass(enc({ surface: 110, pieces: 4 })).label; // 'maison'
```

### 12. Régression (prédire un nombre)

```ts
await grid.train(enc({ surface: 120, pieces: 4 }), 480000);
await grid.train(enc({ surface: 60, pieces: 2 }), 240000);

grid.predictNumeric(enc({ surface: 115, pieces: 4 })).value; // ~ prix estimé
```

### 13. Génération native (recombiner l'appris)

```ts
await grid.processData('bonjour ');
await grid.processData('bonsoir ');
grid.generate({ steps: 4 }).text; // suite de fragments réellement ingérés
```

## Persistance

### 14. Sauvegarder et restaurer le graphe

```ts
const snapshot = grid.serialize();
const restored = XNeuroneGrid.fromSnapshot(snapshot);
restored.countNodes(); // même graphe
```

### 15. Persistance + recherche dans une base vectorielle

```ts
import { VectorGridStore } from '@damba/libxn';
import { QdrantVectorStore } from '@damba/libxn-qdrant';

const store = new VectorGridStore(new QdrantVectorStore('http://localhost:6333'));
await store.save('ma-kb', kb.grid.serialize());   // persiste
const snap = await store.load('ma-kb');            // recharge
```

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
