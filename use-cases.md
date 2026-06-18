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

Les constructeurs et méthodes utilisés ici :

- **`new XNeuroneGrid(encoder?, opts?)`** — la grille QPath (le graphe en mémoire).
  - `encoder?` *(optionnel)* — fonction qui transforme une donnée en paires de bits. À `undefined`,
    QPath prend l'encodeur par défaut (`BinaryConverter.toBinaryPairs`). On ne le passe que pour un
    encodage sur-mesure.
  - `opts?` *(optionnel, défaut `{}`)* — options ; `{ headless: true }` = **sans rendu 3D** (Node /
    serveur / Web Worker). Sans ce drapeau, la grille tente d'attacher un visualiseur Three.js.
- **`new KnowledgeBase(grid)`** — la base de faits posée **sur** la grille. Argument unique : la
  `grid` qui sert de mémoire de travail.

Puis trois méthodes de lecture/écriture :

| Méthode | Rôle | Défaut |
|---|---|---|
| `tell(s, p, o, source?, flags?)` | écrit le fait `(sujet, prédicat, objet)` ; renvoie une `Promise`. `source?` attache la provenance (qui/d'où), `flags?` les drapeaux (`closed`, `major`…). | `source`/`flags` = aucun |
| `ask(s, p)` | lecture **directe** : objets connus pour `(sujet, prédicat)`. Renvoie `string[]` (vide si rien). | — |
| `askInverse(p, o)` | lecture **inverse** : tous les **sujets** tels que `(s, p, o)`. Renvoie `string[]`. | — |

> 💡 `tell` est asynchrone (`await`) car la grille peut persister ; `ask`/`askInverse` sont
> synchrones et à **0 token** — elles lisent un index en mémoire.

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

`askIntersect` croise plusieurs conditions :

- **`askIntersect(conditions)`** — `conditions` est un tableau de paires `[prédicat, objet]`
  (type `Array<[string, string]>`). Renvoie les **sujets qui satisfont TOUTES** les conditions
  (intersection), sous forme de `string[]`. Un tableau vide en entrée renvoie `[]`.

**Domaines.** Catalogues produits, profils utilisateurs, ontologies métier, CRM léger, moteurs de FAQ.

## 3. Recommandation & similarité

```ts
kb.askSimilar('marc', 3).map(r => r.subject);  // les sujets les plus proches de 'marc'
kb.askCompare('marc', 'julie');                // facts communs + distinctifs
```

Les deux méthodes de rapprochement :

- **`askSimilar(s, topN?)`** — `s` le sujet de référence ; `topN?` le nombre de voisins à retourner
  (**défaut 5**). Renvoie un tableau trié `Array<{ subject, similarity, commonFacts }>` :
  `similarity` ∈ [0, 1] (proportion de faits `(p, o)` partagés), `commonFacts` leur nombre.
- **`askCompare(s1, s2)`** — deux sujets à comparer. Renvoie un objet
  `{ common, onlyIn1, onlyIn2 }`, chacun étant une liste de `{ p, o }` : les faits communs, puis ceux
  propres à `s1` et à `s2`.

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
// → "dossier-42 —est→ résident —a_droit→ prestation-A  (⇒ a_droit = prestation-A, confiance 1.00, via transitive)"
```

Le résolveur de chaînes :

- **`new ChainResolver(kb, algebra?)`** — `kb` la base à parcourir ; `algebra?` l'algèbre de prédicats
  qui définit la transitivité/composition (**défaut** `PredicateAlgebra.withDefaults()`, qui couvre les
  cas courants). On ne fournit son propre `algebra` que pour des règles de composition sur-mesure.
- **`chain(s, targetP, opts?)`** — cherche la **plus courte** chaîne de faits reliant le sujet `s` à un
  objet via le prédicat (éventuellement composé) `targetP`.

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | sujet de départ | — |
| `targetP` | prédicat (composé) à atteindre | — |
| `opts.maxDepth` | profondeur max (nombre de maillons) | `4` |
| `opts.confidence` | agrégation de la confiance : `'min'` (maillon le plus faible) ou `'product'` (les incertitudes se composent) | `'min'` |

  `chain` renvoie une `ReasoningChain` (la trace), ou **`null`** si aucune chaîne valide n'existe — d'où
  le `chain!` (assertion non-nul) dans l'exemple.
- **`ChainResolver.format(chain)`** — méthode **statique** ; transforme une `ReasoningChain` en chaîne
  de caractères lisible (la flèche annotée ci-dessus).

> 💡 `ChainResolver` est **paresseux** (raisonnement à la demande, rien n'est matérialisé), à l'inverse
> du `RuleEngine` ci-dessous qui dérive les faits **à l'écriture**.

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

Le moteur de règles :

- **`new RuleEngine(kb, persistent?, store?, storageKey?)`**

| Argument | Rôle | Défaut |
|---|---|---|
| `kb` | la base où lire les conditions et écrire les faits dérivés | — |
| `persistent?` | persister les règles (les recharger au démarrage) ; `false` = règles en mémoire seulement, comme ici | `true` |
| `store?` | le magasin clé-valeur de persistance des règles | `new MemoryStore()` |
| `storageKey?` | clé de stockage (permet de scoper les règles, ex. par conversation) | `STORAGE_KEY` |

- **`addRuleFromText(text, name?, origin?)`** — `text` est la règle en DSL (« si…alors… » →
  `condition => conséquence`). `name?` un libellé optionnel ; `origin?` la provenance
  (`'manual' | 'induced' | 'document'`, **défaut `'manual'`**). Renvoie la `Rule` créée, ou **`null`**
  si le texte est rejeté (raison dans `rules.lastRefineError`).
- **`applyAllRules()`** — applique toutes les règles (chaînage avant) et matérialise les faits dérivés.
  Renvoie une `Promise<number>` : le **nombre de nouveaux faits** dérivés.

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

L'apprentissage et la prédiction par la grille :

- **`BinaryConverter.toBinaryPairs(data)`** — méthode **statique** ; encode n'importe quelle donnée
  (primitive, tableau, objet) en `[number, number][]` (les paires de bits → directions) que la grille
  consomme. Argument unique : `data`.
- **`trainClass(pairs, label)`** — apprend un exemple : `pairs` le vecteur encodé, `label` la classe
  associée (string). Renvoie une `Promise<void>` ; l'effet est d'incrémenter les compteurs de classe
  le long du chemin.
- **`predictClass(pairs)`** — prédit la classe d'un `pairs` encodé. Renvoie un objet
  `{ label, probability, depth, samples, distribution }` : `label` la classe dominante (ou `undefined`
  si rien d'appris sur ce chemin), `probability` sa proportion, `depth` la profondeur atteinte,
  `samples` le nombre d'exemples au nœud, et `distribution` la répartition complète des labels.

**Domaines.** Tri/étiquetage rapide, scoring embarqué, prototypage ML sans infrastructure.

## 8. Raisonnement causal & temporel (post-mortems, enquêtes)

Remonter aux causes racines, dérouler les conséquences, ordonner une chronologie, repérer les
incohérences (une cause prouvée *après* son effet) — sur des événements stockés en faits, en déterministe.

**Domaines.** Post-mortems d'incidents, dossiers d'enquête, historiques, récits. → [Plot reasoning](plot-reasoning).

## 9. Détection proactive (anomalies, contradictions, lacunes)

La mémoire **parle sans qu'on l'interroge** : elle signale les contradictions, les presque-règles violées
par un cas isolé, les attributs manquants, les faits périmés.

**Domaines.** Qualité des données, conformité continue, supervision, curation. → [Proactive deduction](insight-reasoning).

## 10. Raisonnement ouvert sans hallucination (LLM ↔ QPath)

Le LLM propose un pas, QPath le **vérifie** ; les hypothèses validées sont réinjectées et réutilisables à
0 token. Aucune affirmation non vérifiée n'est retenue.

**Domaines.** Assistants fiables, agents outillés, Q&R ancrée. → [PingPong reasoning](pingpong-reasoning).

## 11. Identité, secrets & contrôle d'accès

Modéliser l'authentification, des faits **secrets** (chiffrés au repos, masqués des lectures normales),
des **gardes** d'accès et un audit — directement dans les faits, la crypto branchée par ports.

**Domaines.** Coffres, RBAC d'entreprise, journaux d'audit. → [Couche d'accès](access-layer).

## 12. Comptes & portefeuilles (append-only)

Mouvements **immuables**, solde **calculé** (jamais muté), contraintes (plancher / plafond / vélocité),
virements prévalidés des deux côtés.

**Domaines.** Portefeuilles, points de fidélité, crédits, quotas. → [Grand livre](transaction-ledger).

## 13. Multi-locataire & dev/prod (couches)

Des **valeurs par défaut** (organisation / générique) surchargées par utilisateur ou conversation ;
tester des faits dans une surcouche **dev** sans toucher la **prod**, puis promouvoir.

**Domaines.** SaaS multi-tenant, personnalisation, environnements. → [Sous-couches](layers).

## 14. Factflow : le comportement de l'app dans des faits

Le flot de contrôle (conditions, boucles, actions) vit dans des faits ; **ajouter un fait change le
comportement sans redéployer**, testé en dev et promu en prod **sous validation**.

**Domaines.** Low-code déterministe, feature flags avancés, apps reconfigurables à chaud. → [Factflow](dynamic-behavior).

---

## Tous les avantages en un coup d'œil

| Avantage | Ce que ça donne |
|----------|-----------------|
| **Déterministe** | mêmes faits → mêmes réponses ; reproductible |
| **0 token** | lecture & raisonnement instantanés et gratuits ; latence indépendante de la taille |
| **Traçable** | chaque conclusion porte sa chaîne de preuve |
| **Persistant & éditable** | mémoire auditable, corrigeable, qui s'accumule |
| **Anti-hallucination** | grounding LLM ↔ QPath ; rien d'inventé n'est retenu |
| **Temporel** | provenance, fraîcheur (TTL), archives (fenêtres de validité) |
| **Entités first-class** | alias / homonymes, fusion / scission avec preuve |
| **Sécurité native** | secrets chiffrés, contrôle d'accès, audit — en faits |
| **Multimodal** | texte, image, audio → même substrat |
| **Hybride** | symbolique + sémantique (pgvector / Qdrant) + web |
| **Versionné** | releases taguées, rollback (archives) |
| **Durable** | Postgres / pgvector ; survit aux redémarrages |
| **Sans dépendance** | isomorphe (Node, navigateur, Web Worker), transports par ports |
| **Proactif** | signale anomalies / contradictions sans qu'on demande |

## Ce que ça apporte de nouveau

- **Une seule structure** est à la fois **stockage, index, raisonneur et substrat d'exécution** — pas une
  pile d'outils séparés à intégrer.
- **Le comportement applicatif comme données** : on reconfigure une app **à chaud**, par des faits, sous
  validation — sans redéployer.
- **Une mémoire qui parle sans qu'on l'interroge** : elle anticipe (contradictions, lacunes, similarités).
- **Une mémoire temporelle et tracée nativement** : qui sait *quand* un fait était vrai, *d'où* il vient,
  et *s'il* est encore frais.
- **Plusieurs modes de raisonnement sur le même substrat** : déduction, causal/temporel, proactif, hybride
  LLM-vérifié — sans changer de système.
- **Un coût et une latence indépendants de la taille** pour les lectures et le raisonnement ciblé.

---

::: tip Aller plus loin
Recherche vectorielle via `@damba/libxn-postgres` (pgvector) ou `@damba/libxn-qdrant`, visualisation 3D
du graphe via `@damba/libxn-visualization`. Voir [Architecture](04-guides/architecture).
:::
