# Types de raisonnement

QPath ne « raisonne » pas d'une seule façon. QPath offre une **famille de modes de raisonnement**,
tous appliqués à la même représentation — des faits `(sujet, prédicat, objet)` indexés dans la grille.
Chaque mode a un **coût en tokens explicite** : soit **0 token** (déterministe, calculé sur les faits),
soit **LLM** (uniquement quand le déterministe ne suffit pas).

> 💡 **Principe d'ordonnancement (le pipeline QPath).** On essaie toujours le plus **déterministe et 0
> token d'abord**, et le LLM **en dernier recours**. Un fait connu, une chaîne d'héritage, un agrégat,
> une question temporelle : tout cela répond **sans appeler de modèle**. Le LLM (via PingPong) n'entre
> que lorsqu'aucun chemin déterministe n'aboutit — et même là, **chaque affirmation du LLM est vérifiée
> contre QPath** (pas d'hallucination mémorisée).

## Tableau récapitulatif

| Famille                      | Mode / API                                                                        | Coût                       | Répond à                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Lecture directe              | `ask`, `askInverse`, `askWithCounts`                                              | **0**                      | « Quelle est la valeur de (s, p) ? », « Qui a (p, o) ? »                   |
| Héritage & transitivité      | `reason`, `classesOf`, `askInherited`, `checkInherited`, `askDeep`, `isA`         | **0**                      | « X est-il un Y ? », « X hérite-t-il de cet attribut ? » (avec exceptions) |
| Backward chaining            | `ChainResolver` + `PredicateAlgebra`                                              | **0**                      | « Relie X à un objet par le prédicat composé P » (plus courte chaîne)      |
| Forward chaining             | `RuleEngine` (+ `RuleInducer`, `RelationTaxonomy`)                                | **0**                      | « Dès qu'on sait A, on en déduit B » (règles si…alors)                     |
| Ensemblistes                 | `askIntersect`, `askUnion`, `askDifference`, `askCompare`, `askSimilar`           | **0**                      | « Qui satisfait A ET B ? », « En quoi X et Y diffèrent ? »                 |
| Numériques & quantificateurs | `askNumeric`, `aggregate`, `aggregateAll`, `compute`, `stats`, `forAll`, `exists` | **0**                      | « Combien ? Moyenne ? Tous/au moins un ? »                                 |
| Temporel                     | `valueAsOf`, `factAsOf`, `historyOf`, `statusOf`                                  | **0**                      | « Qu'était la valeur à telle date ? A-t-elle changé ? Est-elle périmée ? » |
| Questions en langage naturel | `deterministicAnswer`                                                             | **0**                      | « Combien de… ? Moyenne de… ? Historique de… ? »                           |
| Causal & narratif            | `PlotReasoner` (`why`, `consequencesOf`, `timeline`, `incoherences`)              | **0**                      | « Pourquoi ? Quelles conséquences ? Dans quel ordre ? »                    |
| Proactif (sans question)     | `InsightEngine`, `findContradictions`                                             | **0**                      | « Qu'est-ce qui cloche / manque / se contredit ? »                         |
| Vérification & fraîcheur     | `FactVerifier`                                                                    | **0** mécanique (+ canaux) | « Ce fait tient-il encore ? »                                              |
| Analogie structurelle        | `PathAlgebra`                                                                     | **0**                      | « A est à B ce que C est à… ? »                                            |
| **Hybride LLM ↔ QPath**      | `PingPongReasoner`                                                                | **LLM** (ancré)            | Questions ouvertes ; chaque pas vérifié par QPath                          |

Les sections ci-dessous **définissent** chaque famille. Les modes qui ont leur propre page y renvoient.

---

## 1. Lecture directe (0 token)

Le raisonnement le plus simple : lire un fait qui a été affirmé.

- **`ask(s, p)` → `string[]`** — tous les objets `o` tels que `(s, p, o)` existe. Source de vérité =
  un index miroir fiable (pas la grille brute), donc **juste par construction**.
- **`askInverse(p, o)` → `string[]`** — l'inverse : tous les sujets `s` tels que `(s, p, o)`. Répond à
  « qui habite à Paris ? ».
- **`askWithCounts(s, p)`** — comme `ask`, mais chaque objet porte un **compte** et une **confiance**
  proportionnelle (un fait affirmé 3 fois sur 4 → confiance 0,75). Sert à pondérer les chaînes.

> Tout le reste du raisonnement se construit sur ces lectures à 0 token.

## 2. Héritage & transitivité (0 token)

Déduire ce qui n'a pas été dit explicitement, en suivant les liens de **classe** (`est`/`est_un`/`is`).

- **`reason(s, p)` → chaîne | `null`** — cherche un objet via une chaîne d'héritage `s —est→ … —est→ o`
  et renvoie la **chaîne complète** (traçable), ou `null`. (`reasonMultiHop` en est la variante explicite
  multi-sauts.)
- **`classesOf(s)`** — la **clôture transitive** : toutes les classes dont `s` hérite, avec la distance.
- **`isA(s, c)`** — « `s` est-il (transitivement) un `c` ? ».
- **`askInherited(s, p)`** — héritage **avec exceptions** (le plus proche gagne) : remonte la hiérarchie
  jusqu'à la classe qui décide, en respectant une **négation explicite**. Exemple classique : un pingouin
  est un oiseau, les oiseaux volent, mais « pingouin NE vole PAS » → la réponse est « faux, décidé au
  niveau du pingouin ». `checkInherited` est la vérification associée.
- **`askDeep(s)`** — tous les objets atteignables depuis `s` par des chaînes d'héritage, avec le chemin.

## 3. Backward chaining déclaratif — ChainResolver (0 token)

Quand le prédicat recherché n'est **pas** stocké directement mais **dérivable par composition** de
prédicats. Voir aussi **[Flash reasoning](/flash-reasoning)**.

- **`PredicateAlgebra`** déclare COMMENT les prédicats se composent : `declareTransitive('est')`,
  `declareInheritance('est')`, `declareComposition('parent_de', 'parent_de', 'grand_parent_de')`,
  `declareInverse('parent_de', 'enfant_de')`.
- **`ChainResolver.chain(s, targetP)`** trouve la **plus courte** chaîne reliant `s` à un objet via le
  prédicat composé `targetP` ; **`chainAll`** rend toutes les chaînes (triées par confiance) ;
  **`verifyChain(s, p, o)`** vérifie qu'une chaîne mène exactement à `o`.

> Exemple : sans jamais stocker « grand-parent », `chain('lea', 'grand_parent_de')` compose deux
> maillons `parent_de` et conclut — en montrant les deux étapes.

## 4. Forward chaining — règles si…alors (0 token)

À l'inverse : dès qu'un fait est écrit, on **dérive** ses conséquences. Voir **[Composants](/components)**.

- **`RuleEngine`** — règles multi-variables façon Datalog : `X est humain ; X habite france => X parle
francais`. À chaque `tell`, les règles qui matchent ajoutent leurs conclusions comme **faits dérivés**
  (provenance tracée), avec garde-fous contre les cascades infinies.
- **`RuleInducer`** — **découvre** des règles candidates en minant les régularités de la base (avec
  support, confiance et **contre-exemples** explicites) — à valider par un humain. 0 token.
- **`RelationTaxonomy`** — généralise les prédicats : déclare que `mère_de` est une forme de `parent_de`,
  et chaque `(alice, mère_de, bob)` dérive aussi `(alice, parent_de, bob)`.

## 5. Requêtes ensemblistes (0 token)

Raisonner sur des **ensembles** de sujets.

- **`askIntersect(conditions)`** — sujets satisfaisant **toutes** les conditions `(p, o)` (ET).
- **`askUnion(conditions)`** — satisfaisant **au moins une** (OU).
- **`askDifference(positifs, négatifs)`** — dans l'un mais pas l'autre.
- **`askCompare(s1, s2)`** — faits **communs** et **différences** entre deux sujets.
- **`askSimilar(s)`** — les sujets les plus **proches** de `s` (par faits partagés).

## 6. Numériques & quantificateurs (0 token)

- **`askNumeric(p, op, v)`** — sujets dont la valeur de `(s, p)` satisfait `>`, `<`, `>=`, `<=`, `=`,
  `!=`, `between`.
- **`aggregate(s, p, fn)`** / **`aggregateAll(p, fn)`** / **`compute(filtre, fn)`** — agrégats (`count`,
  `sum`, `avg`, `min`, `max`, `median`, `variance`, `stddev`, `range`) sur un sujet, sur tous, ou sur un
  filtre. **`stats(filtre)`** renvoie toutes les statistiques d'un coup.
- **`forAll(portée, test)`** / **`exists(portée, test)`** — quantificateurs universel / existentiel, avec
  les **contre-exemples** (ou témoins) explicites.

## 7. Raisonnement temporel (0 token)

Parce que rien n'est jamais effacé (la rétractation **archive**), on peut interroger le passé. Voir
**[Provenance & revérification](/fact-provenance)**.

- **`valueAsOf(s, p, at)`** — la valeur **à une date** donnée.
- **`factAsOf(s, p, at)`** — la valeur à cette date, la valeur actuelle, et un drapeau « a changé ».
- **`historyOf(s, p)`** — toute la **chronologie** des valeurs successives (avec leurs intervalles).
- **`statusOf(s, p, o)`** — `fresh` / `stale` / `unknown` selon une politique de fraîcheur.

## 8. Questions en langage naturel — DeterministicQA (0 token)

**`deterministicAnswer(kb, texte)`** reconnaît des familles de questions **précises** et y répond
**sans LLM** : compte d'une classe (« combien de clients ? »), agrégat (« âge moyen ? »), historique
(« historique de Marie »), et questions **à une date** (« où habitait Alice en 2023 ? »). Renvoie `null`
si la question ne tombe dans aucun motif → on **escalade** alors vers le RAG/LLM.

## 9. Raisonnement causal & narratif — PlotReasoner (0 token)

Suivre des liens de **cause** et d'**ordre** entre événements. Voir **[Plot reasoning](/plot-reasoning)**.

- **`why(event)`** — remonte aux **causes racines** (toutes les chaînes causales).
- **`consequencesOf(event)`** — la **clôture** des conséquences en aval.
- **`timeline()`** — l'**ordre** des événements (tri topologique ; une cause toujours avant son effet).
- **`incoherences()`** — repère les trames **incohérentes** (un effet daté avant sa cause).

## 10. Raisonnement proactif — InsightEngine (0 token)

Raisonner **sans qu'on pose de question** : balayer la base pour ce qui mérite attention. Voir
**[Déduction proactive](/insight-reasoning)**.

- **`findContradictions(s)`** — détecte qu'un fait et sa **négation** coexistent.
- **`InsightEngine.scan()`** — produit des **alertes** (contradiction, incohérence narrative, anomalie =
  contre-exemple d'une quasi-règle, lacune = attribut manquant que la classe possède en majorité, faits
  périmés) et des **suggestions** (entités similaires, faits hérités). Chaque aperçu a une clé stable
  (dédoublonnage entre balayages).

## 11. Vérification & fraîcheur — FactVerifier (0 token mécanique)

**`FactVerifier.verify(s, p, o)`** revérifie **un** fait en le routant vers le canal de sa source
(outil d'origine, web, reverifier injecté…) : verdict `confirmed` (fraîcheur ré-estampillée),
`contradicted` (ancien archivé, nouveau écrit) ou `unknown`. **`sweep()`** fait la passe en lot (agent
curateur). Les faits **secrets** ou **verrouillés** (🔒) ne sont jamais revérifiés, par conception. Le
mécanisme est à 0 token ; un reverifier peut, lui, appeler une source externe.

## 12. Analogie structurelle — PathAlgebra (0 token)

**`PathAlgebra.analogy(a, b, c)`** résout « A est à B ce que C est à… ? » au niveau de la **structure
des chemins** (la transformation de bits de A→B, rejouée sur C) — une analogie purement structurelle,
sans sémantique ni LLM.

## 13. Raisonnement hybride LLM ↔ QPath — PingPong (LLM, ancré)

Quand aucun chemin déterministe n'aboutit, on appelle le modèle — **mais encadré**. Voir
**[PingPong reasoning](/pingpong-reasoning)**.

**`PingPongReasoner.run(question)`** fait un échange court (par défaut 3 tours max) où, à chaque tour, le
LLM joue **un** coup : `ASK` (QPath répond par une chaîne), `HYPOTHESIS` (QPath **vérifie** — anti-
hallucination), `TOOL` (appel d'outil externe), ou `CONCLUDE`. QPath rend un verdict **déterministe** ;
le LLM ne peut donc pas affirmer un fait que la base contredit. Coût : quelques appels LLM ; les
vérifications restent à 0 token.

> 🔒 **Ancrage.** C'est la différence clé : le LLM **propose**, QPath **dispose**. Les hypothèses
> vérifiées peuvent être réécrites dans la base (et deviennent alors gratuites à la prochaine question).

## 14. Vocabulaire d'opérations — QpathOps (0 token)

**`runQpathOp(kb, "verbe:args")`** est un petit **DSL** qui expose les modes ci-dessus en commandes
compactes (`ask:`, `inverse:`, `intersect:`, `compare:`, `similar:`, `classes:`, `inherit:`, `num:`,
`agg:`, `forall:`, `exists:`, `why:`, `consequences:`, `timeline:`…). Il sert au banc d'essai, à l'API
mémoire distante, et au coup `TOOL` du PingPong.

---

## Et l'exécution de flux ?

**`FlowRunner`** ([Factflow](/dynamic-behavior)) n'est **pas** un mode de raisonnement mais un
**exécuteur d'actions** : un flot de contrôle (si/alors, switch, boucle bornée) stocké en faits. Ses
**conditions** sont, elles, des lectures QPath à 0 token — il s'appuie donc sur le raisonnement ci-dessus
pour décider, puis agit.

> En résumé : QPath est **précis par construction** (le raisonnement déterministe couvre l'immense
> majorité des questions, à 0 token) **et** augmenté d'intelligence **à la demande** (le LLM, ancré, pour
> l'ouvert) — le tout **auditable** (chaque conclusion porte sa chaîne et sa provenance).
