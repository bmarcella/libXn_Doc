# Catalogue de tools LLM (`@damba/libxn-tools-llm`)

La page [Outils](/tools) explique comment écrire **votre** outil (le port `Tool` que QPath appelle pour
combler un manque). Cette page décrit l'inverse : un **catalogue prêt à l'emploi** qui expose **toute la
surface de QPath** sous forme de tools, pour qu'un **LLM, n'importe lequel**, puisse piloter la mémoire et
le raisonnement.

> 💡 **L'idée.** Chaque capacité du cœur (lire un fait, raisonner, agréger, comparer des entités, ingérer
> du texte, gérer des droits, déduire…) devient un **tool neutre** décrit en JSON Schema. Un même catalogue
> sert Anthropic, OpenAI, Gemini ou un runtime maison. **230 tools**, dont **178 en lecture** (0 token,
> déterministe) et **52 en écriture**.

## Provider-agnostique

Les entrées des tools sont décrites en **JSON Schema**, le dénominateur commun des trois fournisseurs.
Seule l'enveloppe d'envoi diffère, et des adaptateurs s'en chargent.

```ts
import { buildRegistry, toAnthropicTools, toOpenAITools, toGeminiTools } from '@damba/libxn-tools-llm';

const registry = buildRegistry();          // les 230 tools
toAnthropicTools(registry.list());          // { name, description, input_schema }
toOpenAITools(registry.list());             // { type: 'function', function: {...} }
toGeminiTools(registry.list());             // functionDeclarations
```

## Trois briques

1. **Tool neutre** : `{ name, description, category, parameters (JSON Schema), readOnly, handler }`.
2. **Adaptateurs** : `toAnthropicTools` / `toOpenAITools` / `toGeminiTools` / `toPlainTools`, plus un pont
   `toCoreTool` vers le `ToolRegistry` du cœur (FlowRunner, résolution par prédicat).
3. **Récupération** : `registry.search(query)` (0 token). Un grand catalogue n'est utile que si on
   n'expose au modèle que les tools **pertinents** pour la tâche, au lieu des 230 d'un coup.

```ts
const tools = toAnthropicTools(registry.search('qui habite la même ville', 12)); // 12, pas 230
```

## Exécuter un appel

`runTool` valide l'entrée contre le schéma, exécute le handler, et ne renvoie **jamais** une exception
brute au LLM : un `{ value }` ou un `{ error }` normalisé.

```ts
import { runTool, type ToolContext } from '@damba/libxn-tools-llm';

const ctx: ToolContext = { kb };  // le contexte porte la mémoire et les sous-systèmes
const out = await runTool(ctx, registry, 'kb_ask', { s: 'jean', p: 'habite' });
// -> { value: ['paris'] }
```

## Le contexte

`kb` est requis. Les sous-systèmes **stateful** sont fournis au besoin ; un tool qui en dépend renvoie une
erreur claire s'il manque.

| Champ | Sert à |
|---|---|
| `kb` | tout (lecture, écriture, raisonnement, recettes) |
| `rules` | moteur de règles (chaînage avant) |
| `entityMemory` | mémoire d'entités (similarité VSA) |
| `generator` | déduction générative (quarantaine) |
| `contextualizer` | routage d'intention |
| `grid` | grille QPath brute |

Companion, droits d'accès (RBAC), grand livre et **recettes** se construisent depuis `kb` (rien à fournir).

## Les domaines

`recipe` 36, `kb.read` 24, `kb.reason` 20, `kb.aggregate` 19, `access` 16, `nl` 16, `ml` 13, `rules` 13,
`kb.write` 10, `kb.sets` 9, `ledger` 9, `companion` 8, `generative` 8, `kb.provenance` 6, `kb.entity` 5,
`kb.temporal` 5, `flow` 5, `grid` 4, `intent` 4.

## Recettes : une intention, un appel

Au-delà des primitives, les **recettes** orchestrent plusieurs capacités pour répondre à une intention
réelle en un seul appel. Quelques exemples :

- **`recipe_answer`** : répond à `(sujet, prédicat)` en cascade déterministe (fait direct → héritage →
  déduction analogique Big Bang), avec la méthode utilisée. La meilleure réponse possible sans LLM.
- **`recipe_entity_profile`** : faits, classes, faits compagnons et entités similaires d'une entité, d'un coup.
- **`recipe_ingest_text`** : ingère du texte libre en faits **validés** et les écrit (extraction puis pipeline ancré).
- **`recipe_fill_gaps`** : devine les traits absents d'une entité par vote de ses voisins similaires.
- **`recipe_why`** / **`recipe_consequences`** : chaînes causales en amont / aval d'un événement.
- **`recipe_fact_health`** / **`recipe_contradiction_scan`** : diagnostic de cohérence (contradictions, stale).
- **`recipe_kb_report`** : tableau de bord (faits, index, cohérence, top prédicats et classes).
- **`recipe_access_audit`** : qui a quelles permissions sur un groupe.

## Boucle d'appels d'outils

Le même registre sert n'importe quel LLM : on traduit au format du fournisseur, puis on exécute chaque
appel via `runTool`.

```ts
const tools = toAnthropicTools(registry.search(userMessage, 16));
let messages = [{ role: 'user', content: userMessage }];

for (;;) {
  const res = await anthropic.messages.create({ model, max_tokens: 1024, tools, messages });
  messages.push({ role: 'assistant', content: res.content });
  const calls = res.content.filter((b) => b.type === 'tool_use');
  if (!calls.length) break;                 // réponse finale

  const results = [];
  for (const call of calls) {
    const out = await runTool(ctx, registry, call.name, call.input);
    results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) });
  }
  messages.push({ role: 'user', content: results });
}
```

Pour OpenAI ou Gemini, c'est le même schéma avec `toOpenAITools` / `toGeminiTools`.

## Cas d'usage concrets

Chaque scénario est une suite d'appels `runTool(ctx, registry, name, input)`. Les commentaires montrent la
valeur renvoyée. Tout est déterministe et à 0 token, sauf les appels marqués `// W` (écriture).

### 1. Assistant « formless » qui apprend et profile

L'utilisateur parle en langage libre ; on ingère, puis on interroge.

```ts
await runTool(ctx, registry, 'recipe_ingest_text', { text: 'Jean habite Paris et est développeur', self: 'jean' }); // W
await runTool(ctx, registry, 'recipe_ingest_text', { text: 'Marie habite Paris' });                                 // W

// « Qui ressemble à Marie ? »
await runTool(ctx, registry, 'recipe_who_is_similar', { s: 'marie' });
// -> [{ subject: 'jean', similarity: 1, shared: [{ p: 'habite', o: 'paris' }] }]

// « Que peut-on deviner sur Marie ? »  (vote des voisins similaires)
await runTool(ctx, registry, 'recipe_fill_gaps', { s: 'marie' });
// -> { gaps: [{ predicate: 'metier', value: 'developpeur', support: 1 }] }
```

### 2. Question-réponse déterministe avec héritage

```ts
await runTool(ctx, registry, 'recipe_ingest_text', { text: 'Un chat est un animal. Un animal est mortel.' }); // W

await runTool(ctx, registry, 'recipe_verify_claim', { s: 'chat', p: 'est', o: 'mortel' });
// -> { verdict: 'yes', method: 'inheritance' }   (chat puis animal puis mortel)

await runTool(ctx, registry, 'recipe_explain_answer', { s: 'chat', p: 'est' });
// -> { answer: ['animal'], explanation: 'chat est animal (fait direct).' }
```

### 3. Mémoire temporelle (ce qu'un LLM seul ne fait pas)

```ts
await runTool(ctx, registry, 'kb_tell', { s: 'jean', p: 'plat_prefere', o: 'sushi' });                                  // W
await runTool(ctx, registry, 'recipe_correct_fact', { s: 'jean', p: 'plat_prefere', oldO: 'sushi', newO: 'pizza' });    // W
await runTool(ctx, registry, 'recipe_timeline_of', { s: 'jean', p: 'plat_prefere' });
// -> { history: [{ s: 'jean', p: 'plat_prefere', o: 'sushi', from, to }] }   // l'ancienne valeur est archivée, jamais perdue
```

### 4. Raisonnement par règles + inférence

```ts
const ctx = { kb, rules: new RuleEngine(kb) };           // sous-système stateful fourni par l'hôte
await runTool(ctx, registry, 'rules_add', { dsl: 'X est humain => X est mortel' });  // W

await runTool(ctx, registry, 'recipe_learn_and_infer', { text: 'Socrate est humain' }); // W
// -> { stored: [['socrate','est','humain']], derived: 1 }   // « socrate est mortel » déduit par chaînage avant
```

### 5. Compte / quantités (Ledger)

```ts
await runTool(ctx, registry, 'ledger_open', { account: 'alice', initialBalance: 100 }); // W
await runTool(ctx, registry, 'ledger_deposit', { account: 'alice', amount: 50 });        // W
await runTool(ctx, registry, 'ledger_withdraw', { account: 'alice', amount: 500 });      // refusé (sous le plancher)
await runTool(ctx, registry, 'ledger_balance', { account: 'alice' });
// -> 150   (solde calculé, jamais stocké)
```

### 6. Partage & audit RBAC

```ts
await runTool(ctx, registry, 'access_declare_group', { name: 'projet' });                            // W
await runTool(ctx, registry, 'access_grant', { member: 'bob', group: 'projet', perms: ['read'] });   // W

await runTool(ctx, registry, 'recipe_access_audit', { group: 'projet' });
// -> { group: 'projet', members: { bob: ['read'] }, factCount: ... }
```

### 7. Tableau de bord & qualité de la base

```ts
await runTool(ctx, registry, 'recipe_kb_report', {});
// -> { factCount, index, coherence, topPredicates: [...], topClasses: [...] }

await runTool(ctx, registry, 'recipe_contradiction_scan', {});
// -> { coherence: 1, found: [] }   // aucune contradiction (s,p,o) vs (s,not_p,o)

await runTool(ctx, registry, 'recipe_rank_by', { p: 'age' });
// -> [{ subject: 'marie', value: 40 }, { subject: 'jean', value: 30 }]
```

## En résumé

- Une seule définition de tool, **utilisable avec tout LLM** (pas de couplage à un fournisseur).
- La **récupération** rend un grand catalogue exploitable (on n'expose que le pertinent).
- Les lectures sont **déterministes et à 0 token** ; les écritures restent **auditables** (provenance,
  temporel), conformément au modèle QPath.
- Les **recettes** transforment des intentions concrètes en un seul appel ancré sur la mémoire.

## Référence : les 230 tools

Liste complète, groupée par domaine. **R** = lecture (0 token, déterministe), **W** = écriture. Le nom du
tool est son identifiant d'appel ; la description est celle vue par le LLM. Générée depuis le registre.

### Recettes (composites) (`recipe`, 36)

| Tool | RW | Description |
|---|---|---|
| `recipe_about` | R | Tout ce qui concerne un terme : faits où il est SUJET (par prédicat) + faits où il est OBJET (qui le mentionne). Exploration 360°. |
| `recipe_access_audit` | R | Audit RBAC d'un groupe : infos, nombre de faits, et qui a quelles permissions (read/write/update/delete). |
| `recipe_answer` | R | Répond à une question (sujet, prédicat) en cascade DÉTERMINISTE 0 token : fait direct -&gt; héritage (reason) -&gt; déduction analogique (Big Bang). Renvoie {answer, method, confidence?}. La meilleure réponse possible sans LLM. |
| `recipe_class_members` | R | Membres d'une classe (via est/est_un/is) + leurs attributs communs. « tous les X » et ce qui les caractérise. |
| `recipe_classify_entity` | R | Classes PROBABLES d'une entité : ses classes connues + celles votées par ses voisins similaires (pour une entité peu/pas typée). « X est probablement un … ». |
| `recipe_compare_entities` | R | Compare deux entités : faits communs, propres à chacune, nombre de points communs. |
| `recipe_compare_numeric` | R | Compare deux sujets sur un prédicat numérique : valeurs + lequel est le plus grand. |
| `recipe_consensus` | R | Que disent les entités SIMILAIRES à X pour le prédicat p ? Vote des voisins + déduction analogique. Utile quand X n'a pas (encore) ce trait. |
| `recipe_consequences` | R | Causalité : tout ce qui DÉCOULE d'un événement (clôture causale en aval). « Conséquences de X ? ». |
| `recipe_contradiction_scan` | R | Balaie la base à la recherche de sujets en contradiction (s,p,o) vs (s,not_p,o). Renvoie le score de cohérence + les sujets fautifs (bornés). |
| `recipe_correct_fact` | W | Corrige un fait : archive l'ancienne valeur et écrit la nouvelle (editFact, temporel). « ce n'est pas X mais Y ». Renvoie {applied}. |
| `recipe_count_by_class` | R | Compte les sujets par classe (via est/est_un/is). « combien d'animaux, de personnes… », vue de répartition. |
| `recipe_disambiguate` | R | Désambiguïse un nom homonyme : liste les entités distinctes (jean, jean#2…) avec leur discriminant et leurs faits, pour choisir la bonne. |
| `recipe_entity_profile` | R | Profil COMPLET d'une entité en un appel : faits (par prédicat), classes, compagnons (CompanionFacts), entités similaires. Vue d'ensemble. |
| `recipe_evidence` | R | Dossier de preuve d'un fait (s,p,o) : ses sources/provenance, le verdict de vérification (héritage), et les contradictions du sujet. |
| `recipe_explain_answer` | R | Répond à (s,p) ET fournit une EXPLICATION en langage naturel (fait direct ou chaîne d'héritage détaillée). « Pourquoi penses-tu ça ? ». |
| `recipe_fact_health` | R | Diagnostic de cohérence d'un sujet : contradictions explicites + score de cohérence global + faits périmés (stale) le concernant. |
| `recipe_fill_gaps` | R | Trouve les attributs que les entités SIMILAIRES possèdent et que X n'a PAS, puis les devine par analogie. « que peut-on deviner sur X ». Renvoie les traits probables triés par confiance. |
| `recipe_forecast_numeric` | R | Synthèse numérique d'un prédicat à travers tous les sujets : stats (count/avg/min/max/median/stddev…) + valeurs. Base d'une prévision ancrée sur les données. |
| `recipe_group_summary` | R | Caractérise un GROUPE de sujets : les attributs (p,o) qu'ils partagent (au moins minOverlap d'entre eux). |
| `recipe_ingest_text` | W | INGÈRE du texte libre : extrait des faits validés (extractGrammar -&gt; runFactPipeline) et les ÉCRIT dans la KB (avec display + drapeaux). self (opt) = sujet 1ʳᵉ personne. Renvoie {stored, dropped}. |
| `recipe_kb_report` | R | Tableau de bord de la base : nombre de faits, index (sujets/prédicats uniques), cohérence globale, prédicats les plus fréquents, classes les plus peuplées. |
| `recipe_learn_and_infer` | W | Apprend du texte PUIS déclenche le chaînage avant des règles (si ctx.rules) pour déduire de nouveaux faits. Renvoie {stored, derived}. apply:false pour ne pas inférer. |
| `recipe_merge_review` | R | Revue AVANT fusion de deux entités : faits communs + CONFLITS (même prédicat, valeurs différentes). safe=true si aucune collision. À consulter avant kb_merge_entities. |
| `recipe_predicates_overview` | R | Vue d'ensemble du schéma : chaque prédicat connu avec le nombre de sujets qui le portent. Pour comprendre la forme de la base. |
| `recipe_rank_by` | R | Classe les sujets par la valeur NUMÉRIQUE d'un prédicat (décroissant). « les plus âgés », « les plus chers ». Renvoie le top n. |
| `recipe_relate` | R | Comment deux entités sont-elles CONNECTÉES ? Cherche un chemin de s1 vers s2 via n'importe quels prédicats (BFS). Renvoie {connected, path}. |
| `recipe_search` | R | Recherche plein-texte (sous-chaîne) dans tous les faits : sujet, prédicat OU objet contenant le terme. « tout ce qui mentionne … ». |
| `recipe_story_check` | R | Cohérence d'un récit : chronologie (tri topologique) + incohérences détectées (contradictions d'ordre, cycles causaux). |
| `recipe_summarize_subject` | R | Résumé lisible d'un sujet : ses faits groupés par prédicat (forme d'affichage) + ses classes. Une « fiche » prête à présenter. |
| `recipe_timeline_of` | R | Chronologie horodatée des CHANGEMENTS d'un sujet (valeurs archivées via retract). « l'histoire de X » / « ce que X était avant ». |
| `recipe_top_values` | R | Valeurs dominantes d'un prédicat à travers tous les sujets : fréquences, mode, valeurs distinctes. « les villes les plus fréquentes », etc. |
| `recipe_verify_claim` | R | Vérifie une affirmation (s,p,o) : verdict par héritage (checkInherited) ; si inconnu, tente une déduction probable (Big Bang). Renvoie {verdict, method, …}. |
| `recipe_who_can` | R | Qui peut faire quoi sur un groupe : liste des membres par permission. |
| `recipe_who_is_similar` | R | Les entités les plus similaires à X AVEC l'explication : pour chaque voisin, les faits réellement partagés. « qui ressemble + pourquoi ». |
| `recipe_why` | R | Causalité : toutes les chaînes causales qui MÈNENT à un événement (vers les causes racines). « Pourquoi X est-il arrivé ? ». |

### KnowledgeBase — lecture (`kb.read`, 24)

| Tool | RW | Description |
|---|---|---|
| `kb_all_facts` | R | Énumère tous les faits (s,p,o + statut/sources/drapeaux). Secrets exclus par défaut. LOURD à grande échelle : préférer des requêtes ciblées. |
| `kb_ask` | R | Lit les objets d'un fait (sujet, prédicat, ?). Fusionne les alias (same_as). 0 token. Ex: kb_ask(s="jean", p="habite") -&gt; ["paris"]. |
| `kb_ask_direct` | R | Lit les objets SANS fusion d'alias (grain de stockage brut). 0 token. |
| `kb_ask_inverse` | R | Requête inverse : tous les sujets s tels que (s, p, o). O(1). Ex: qui habite paris ? kb_ask_inverse(p="habite", o="paris"). |
| `kb_ask_with_counts` | R | Comme kb_ask mais renvoie pour chaque objet son décompte + confiance (fréquence). Utile en cas de valeurs multiples. |
| `kb_coherence_score` | R | Score de cohérence global (1.0 = aucune contradiction), sur un échantillon de sujets. |
| `kb_display_of` | R | Forme d'affichage (verbatim) d'un objet de fait : casse/nom propre d'origine. Pour les libellés UI. |
| `kb_distinct_values` | R | Valeurs distinctes (uniques) des objets des faits filtrés. Ex: villes distinctes -&gt; distinctValues({p:"habite"}). |
| `kb_fact_count` | R | Nombre total de faits dans la base (tous sujets). |
| `kb_fact_count_of` | R | Nombre total de faits pour un sujet (tous prédicats confondus). |
| `kb_fact_id` | R | ID déterministe d'un fait (hash du triplet normalisé). Stable, survit à la recréation à l'identique. |
| `kb_find_contradictions` | R | Détecte les contradictions explicites d'un sujet : où (s,p,o) ET (s,not_p,o) coexistent. |
| `kb_frequencies` | R | Histogramme valeur -&gt; nombre d'occurrences parmi les faits filtrés. Ex: répartition des villes. |
| `kb_index_stats` | R | Statistiques d'index (sujets uniques, prédicats uniques, entrées inverses). Diagnostic. |
| `kb_known_predicates` | R | Liste vivante des prédicats connus (appris dynamiquement, portée processus). |
| `kb_list_subjects` | R | Liste les sujets connus avec leur nombre de faits (diagnostic). Optionnellement limité. |
| `kb_match_count` | R | Compte les objets (filtrés) contenant une sous-chaîne (insensible à la casse). |
| `kb_match_facts` | R | Sélectionne des faits par filtre partiel : tout champ absent = joker. Ex: matchFacts({p:"habite"}) -&gt; tous les (?, habite, ?). |
| `kb_mode` | R | Valeur d'objet la plus fréquente parmi les faits filtrés (mode statistique). |
| `kb_normalize` | R | Normalise un terme comme au stockage (minuscule + trim). Utile pour comparer/construire des clés. |
| `kb_predicates_of` | R | Liste tous les prédicats stockés pour un sujet. O(1). Ex: que sait-on sur jean ? -&gt; ["habite","aime","est"]. |
| `kb_subjects_with_predicate` | R | Tous les sujets qui portent ce prédicat. Ex: qui a une ville ? kb_subjects_with_predicate(p="habite"). |
| `kb_subjects_with_prefix` | R | Sujets dont le nom (normalisé) commence par un préfixe. Balayage de préfixe (rapide). Ex: tous les "note:". |
| `kb_triplet_of` | R | Triplet (s,p,o) correspondant à un factId, ou null si inconnu. |

### KnowledgeBase — raisonnement (`kb.reason`, 20)

| Tool | RW | Description |
|---|---|---|
| `bigbang_expand` | R | Déduction « Big Bang » : étend un sujet par ANALOGIE (voisins similaires) + régularité de classe. Renvoie des faits PROBABLES (confiance + support), non mémorisés. |
| `bigbang_expand_all` | R | Étend TOUS les sujets par analogie/classe (jusqu'à limit). Faits probables non mémorisés. |
| `kb_analogize` | R | Analogie structurelle : prédit (s,p,?) en transformant des exemples connus de (p) ; vote majoritaire + confiance. null si rien. |
| `kb_ask_chain` | R | Inférence transitive via est : si (s,p) vide, remonte (s,est) -&gt; parent -&gt; (parent,p). |
| `kb_ask_deep` | R | BFS multi-prédicat : tous les objets atteignables depuis s via N'IMPORTE QUEL prédicat, avec le chemin. |
| `kb_ask_inherited` | R | Héritage avec EXCEPTIONS : résout (s,p) via les classes ; le fait le plus proche (direct ou hérité) ou la négation (not_p) décide. |
| `kb_associate` | R | Rappel associatif : marche stochastique depuis un germe via la force de connexion (Hebbien). Non déterministe, best-effort. |
| `kb_check_inherited` | R | Verdict ancré sur (s,p,o) avec héritage : "yes" (affirmé/hérité), "no" (nié par not_p), "unknown". |
| `kb_classes_of` | R | Toutes les classes atteignables depuis s via est/est_un/is + subclass_of (transitif, BFS par distance). |
| `kb_is_a` | R | s est-il transitivement membre de la classe c ? (héritage). Booléen. |
| `kb_nearest_subjects` | R | Sujets au plus long préfixe de chemin commun (géométrie QPath) : du plus proche au plus loin. Inclut s s'il est connu. |
| `kb_reason` | R | Inférence avec trace : chaîne de raisonnement vers la conclusion via héritage (est). null si rien. |
| `kb_reason_approx` | R | Raisonnement APPROXIMATIF : la topologie QPath résout une référence inexacte (faute de frappe, troncature) au-dessus d'un seuil, puis lit le fait. Renvoie le sujet résolu + similarité. |
| `kb_reason_multi_hop` | R | Multi-saut : atteint (s) à un objet répondant (p) via N'IMPORTE QUELS prédicats intermédiaires (BFS), pas seulement est. |
| `kb_verify` | R | Vérifie un fait (s,p,o) par héritage ascendant (est). Renvoie {yes, trace}. |
| `plot_consequences` | R | Causalité : clôture causale EN AVAL d'un événement. « Conséquences de X ? ». |
| `plot_incoherences` | R | Détecte les contradictions d'ordre et les cycles causaux. |
| `plot_timeline` | R | Chronologie : tri topologique des événements par ordre + arêtes causales. |
| `plot_why` | R | Causalité : toutes les chaînes causales qui MÈNENT à un événement (vers les racines). « Pourquoi X ? ». |
| `qa_deterministic` | R | Q&A déterministe : reconnaît les questions de comptage/agrégat/historique/as-of et y répond en 0 token. null si non reconnu (laisser au LLM). |

### KnowledgeBase — agrégats & numérique (`kb.aggregate`, 19)

| Tool | RW | Description |
|---|---|---|
| `kb_aggregate` | R | Raccourci : agrégat sur les objets de (s, p). fn ∈ sum/avg/min/max/median/variance/stddev/range/count. |
| `kb_aggregate_all` | R | Agrégat inter-sujets sur un prédicat. Ex: âge moyen de tous -&gt; kb_aggregate_all({p:"age", fn:"avg"}). |
| `kb_ask_numeric` | R | Comparaison numérique : sujets dont (p) op value. op ∈ &gt; &gt;= &lt; &lt;= = != between (between utilise value2). |
| `kb_avg` | R | Agrégat avg sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_avg({p:"age"}). |
| `kb_compare_numeric` | R | Signe de la comparaison (v1 − v2) de (p) entre deux sujets : -1 / 0 / 1, ou null si manquant. |
| `kb_compute` | R | Agrégat numérique paramétrable sur les faits filtrés. fn ∈ sum/avg/min/max/median/variance/stddev/range/count. |
| `kb_concat` | R | Concatène les objets filtrés (séparateur par défaut ", "). |
| `kb_count` | R | Agrégat count sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_count({p:"age"}). |
| `kb_longest` | R | Objet le plus long (longueur de chaîne) parmi les faits filtrés. |
| `kb_max` | R | Agrégat max sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_max({p:"age"}). |
| `kb_median` | R | Agrégat median sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_median({p:"age"}). |
| `kb_min` | R | Agrégat min sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_min({p:"age"}). |
| `kb_numeric_value_of` | R | Première valeur numérique de (s, p), ou null. |
| `kb_range` | R | Agrégat range sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_range({p:"age"}). |
| `kb_shortest` | R | Objet le plus court parmi les faits filtrés. |
| `kb_stats` | R | Toutes les statistiques numériques d'un coup (count/sum/avg/min/max/median/variance/stddev/range) sur les faits filtrés. |
| `kb_stddev` | R | Agrégat stddev sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_stddev({p:"age"}). |
| `kb_sum` | R | Agrégat sum sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_sum({p:"age"}). |
| `kb_variance` | R | Agrégat variance sur les valeurs NUMÉRIQUES des faits filtrés (s/p/o optionnels). Ex: kb_variance({p:"age"}). |

### KnowledgeBase — ensembles & quantificateurs (`kb.sets`, 9)

| Tool | RW | Description |
|---|---|---|
| `kb_ask_compare` | R | Diff de faits entre deux sujets : communs, propres à 1, propres à 2. |
| `kb_ask_difference` | R | Sujets satisfaisant les positifs MAIS PAS les négatifs. Ex: habite paris mais n'aime pas café. |
| `kb_ask_intersect` | R | Sujets satisfaisant TOUTES les conditions [prédicat,objet]. Ex: qui habite paris ET aime café. |
| `kb_ask_similar` | R | Sujets les plus similaires (partagent le plus de faits). Renvoie subject + similarity + commonFacts. |
| `kb_ask_union` | R | Sujets satisfaisant AU MOINS UNE condition [prédicat,objet] (OU). |
| `kb_ask_where` | R | Requête unifiée scorée : must (obligatoire), mustNot (interdit), optional (bonus). Renvoie des candidats avec matchScore. |
| `kb_common_attributes` | R | Attributs (p,o) partagés par au moins minOverlap des sujets fournis. Caractérise un groupe. |
| `kb_exists` | R | EXISTE-t-il un sujet du scope satisfaisant [check_p, check_o] ? Renvoie verdict + témoins. |
| `kb_for_all` | R | TOUS les sujets du scope satisfont-ils [check_p, check_o] ? Renvoie verdict + contre-exemples. |

### KnowledgeBase — écriture (`kb.write`, 10)

| Tool | RW | Description |
|---|---|---|
| `kb_confirm` | W | Confirme un fait existant en ajoutant une source fraîche (re-vérification) ; re-horodate. |
| `kb_declare_unique` | W | Déclare une contrainte de cardinalité sur un prédicat. kind ∈ leftUnique/rightUnique/fullUnique ; onConflict ∈ reject/replace/report. |
| `kb_edit_fact` | W | Remplace l'objet d'un fait : archive l'ancien (retract) + écrit le nouveau. Atomique. Renvoie true si appliqué. |
| `kb_merge_entities` | W | Fusion d'entités (alias) : pose same_as bidirectionnel entre a et b. Échoue si distinct_from existe. |
| `kb_retract` | W | Rétracte un fait : il cesse d'être servi mais est ARCHIVÉ (jamais supprimé). Renvoie false si le fait n'existait pas. |
| `kb_set_flags` | W | Pose/fusionne des drapeaux sur un fait existant (closed/major/group…). |
| `kb_split_entity` | W | Scission d'entité : déplace des faits [{p,o}] vers un nouveau sujet qualifié + pose distinct_from. Renvoie le nouvel id. |
| `kb_tell` | W | Enregistre un fait (s,p,o). Optionnel : display (casse verbatim), closed (🔒 décidé), major (⭐ structurant), group (RBAC). Les doublons s'accumulent. |
| `kb_tell_closed` | W | Enregistre un fait DÉCIDÉ/verrouillé (drapeau closed 🔒) — ne doit plus changer. |
| `kb_tell_major` | W | Enregistre un fait de CLASSE / structurant (drapeau major ⭐) — ossature ontologique prioritaire. Ex: (chat, est, animal). |

### KnowledgeBase — temporel (`kb.temporal`, 5)

| Tool | RW | Description |
|---|---|---|
| `kb_fact_as_of` | R | Réponse temporelle : ce qui était vrai à `at`, ce qui est actuel, et si ça a changé. Renvoie {asOf, current, changed}. |
| `kb_history_of` | R | Faits ARCHIVÉS (rétractés), filtrables par sujet/prédicat. Chronologie horodatée des changements. Secrets exclus par défaut. |
| `kb_stale_facts` | R | Tous les faits dont la fraîcheur a expiré (candidats à re-vérification). |
| `kb_status_of` | R | Fraîcheur d'un fait : "fresh" (dans le TTL ou stable), "stale" (expiré), "unknown" (sans source). |
| `kb_value_as_of` | R | Valeurs de (s,p) VALIDES à l'instant `at` (epoch ms) : combine actuel + archive. « Quel était… avant ? ». |

### KnowledgeBase — entités & alias (`kb.entity`, 5)

| Tool | RW | Description |
|---|---|---|
| `kb_aliases_of` | R | Clôture des alias via same_as (bidirectionnel, borné) ; inclut le sujet lui-même. |
| `kb_base_name_of` | R | Nom de base d'un sujet qualifié : "jean#2" -&gt; "jean". |
| `kb_display_name_of` | R | Libellé lisible d'une entité : "jean#2" + discriminant -&gt; "jean (docteur)". |
| `kb_homonyms_of` | R | Toutes les entités homonymes d'un nom : jean -&gt; [jean, jean#2, …] avec discriminant + nombre de faits. |
| `kb_next_entity_id` | R | Prochain id qualifié libre : jean -&gt; jean#2 -&gt; jean#3. Pour créer un homonyme distinct. |

### KnowledgeBase — provenance & drapeaux (`kb.provenance`, 6)

| Tool | RW | Description |
|---|---|---|
| `kb_flags_of` | R | Drapeaux d'un fait : closed / leftClosed / rightClosed / major / secret / group / companionOf / cascade. |
| `kb_latest_source_of` | R | Source la plus récente (par horodatage) d'un fait. |
| `kb_list_unique_constraints` | R | Toutes les contraintes de cardinalité effectives. |
| `kb_lock_of` | R | État de verrou nommé d'un fait : open / object_locked / subject_locked / closed. |
| `kb_sources_of` | R | Sources accumulées d'un fait (chronologique) : qui/quoi l'a affirmé et quand. |
| `kb_unique_constraint_of` | R | Contrainte de cardinalité déclarée pour un prédicat (leftUnique/rightUnique/fullUnique), ou null. |

### Contrôle d’accès (RBAC) (`access`, 16)

| Tool | RW | Description |
|---|---|---|
| `access_assign` | W | Tague un fait existant avec un groupe (drapeau group). Renvoie true si appliqué. |
| `access_can` | R | Le membre a-t-il la permission sur le groupe ? Booléen. |
| `access_declare_group` | W | Déclare un groupe d'accès (comme fait). Renvoie le sujet du groupe. description optionnelle. |
| `access_declared_groups` | R | Tous les groupes déclarés avec leur nombre de faits. |
| `access_facts_accessible_by` | R | Faits qu'un membre peut lire/écrire (selon perm). |
| `access_facts_in_group` | R | Tous les faits d'un groupe. |
| `access_grant` | W | Accorde une ou plusieurs permissions à un membre sur un groupe (émet des faits de droit). perms ⊂ read/write/update/delete. |
| `access_group_info` | R | Informations d'un groupe (description, nombre de faits). |
| `access_group_of` | R | Groupe d'un fait, ou null. |
| `access_groups` | R | Tous les groupes connus (déclarés ∪ utilisés). |
| `access_groups_accessible_by` | R | Groupes auxquels un membre peut accéder (perm optionnelle). |
| `access_members_with_access` | R | Qui peut accéder (perm optionnelle) à un groupe. |
| `access_permissions_of` | R | Toutes les permissions d'un membre sur un groupe. |
| `access_revoke` | W | Révoque une permission (ou toutes si omise) d'un membre sur un groupe (droit archivé, jamais supprimé). |
| `access_search_in_group` | R | Recherche plein-texte dans les faits d'un groupe. |
| `access_tell_in_group` | W | Écrit un fait ET le tague dans un groupe, atomiquement. Renvoie le factId. |

### Langage naturel (`nl`, 16)

| Tool | RW | Description |
|---|---|---|
| `chitchat_classify_intent` | R | Indice d'intention grossier : "question" | "statement" | "mixed". |
| `chitchat_handle` | R | Détecte le bavardage (salutations, politesse) et renvoie {matched, response?}. Rien n'est stocké. |
| `chitchat_is_affirmation` | R | Le texte est-il une courte réponse positive (oui, ok, d'accord) ? Booléen. |
| `nl_classify_notion` | R | Classe un énoncé : affirmation/causal/spatial/temporel + aspects (négation, secret, rectification). |
| `nl_extract_facts` | R | COMPOSITE : texte -&gt; faits VALIDÉS (extractGrammar puis runFactPipeline ancré sur la KB : dédup, résolution d'entités, vocabulaire, typage, drapeau major sur les classes). Ne stocke RIEN — renvoie {facts, dropped}. |
| `nl_extract_grammar` | R | Extraction grammaticale riche (multi-clause + objets coordonnés + ellipse + spatial/causal/temporel) -&gt; candidats bruts. |
| `nl_fact_refine` | R | Contrôle qualité de candidats {s,p,o} : normalise (minuscule, articles, snake_case prédicats, nombres compacts) + valide. Renvoie {accepted, rejected}. |
| `nl_normalize_predicate` | R | Canonicalise un prédicat (snake_case, minuscule). |
| `nl_normalize_term` | R | Canonicalise un terme (sujet/objet) : minuscule, article retiré, etc. |
| `nl_parse` | R | Analyse une phrase -&gt; {kind: statement|what|yesno|list|unknown, …}. `self` (opt) active la 1ʳᵉ personne sur ce sujet (« j'aime X » -&gt; self). |
| `nl_parse_all` | R | Extraction multi-clause -&gt; liste de {s,p,o} (segmente sur « et », « , », « mais »…). |
| `nl_predicate_canonical` | R | Forme canonique d'un prédicat selon le vocabulaire de synonymes APPRIS de la KB (réside/vit -&gt; habite). |
| `nl_predicate_equivalents` | R | Toutes les formes équivalentes d'un prédicat (synonymes appris de la KB), prédicat inclus. |
| `nl_split_coordination` | R | Découpe une coordination : « alice et bob » -&gt; ["alice","bob"]. |
| `nl_validate_fact` | R | Valide un triplet (s,p,o) : renvoie la raison de rejet, ou null si valide. |
| `qa_parse_when` | R | Parse une expression temporelle (hier, la semaine dernière, une date) en epoch ms, ou null. |

### Mémoire d’entités & encodeurs (ML) (`ml`, 13)

| Tool | RW | Description |
|---|---|---|
| `em_add` | W | Ajoute un fait (role, value) à une entité (la crée si besoin). L'entité reste UNE entrée ; l'empreinte se met à jour. |
| `em_export_entity` | R | Fiche d'une entité (nom + ses faits), pour sauvegarde par entité. null si inconnue. |
| `em_forget` | W | Oublie complètement une entité. |
| `em_names` | R | Liste les noms de toutes les entités en mémoire. |
| `em_predict` | R | Devine la valeur d'un rôle MANQUANT d'une entité via les k plus proches voisins qui l'ont (vote symbolique ou moyenne numérique). Renvoie {value, confidence, support}. |
| `em_register` | W | Enregistre (ou remplace) une entité avec ses faits [{role, value}]. Le code = superposition de ses faits ; deux entités partageant des faits ont des codes proches. |
| `em_remove` | W | Retire des faits d'une entité (par rôle, et valeur si précisée). Renvoie le nombre retiré. |
| `em_similar` | R | Les k entités les plus PROCHES (similaires) d'une entité, par distance de Hamming sur les codes superposés. Renvoie [{name, distance}]. |
| `ml_encode_value` | R | Encode un nombre en VECTEUR de traits directionnels (aplati). mode ∈ bits/onehot. |
| `ml_text_to_quats` | R | Encode du TEXTE en séquence de quats (octet par octet, même mappage que le noyau). |
| `ml_value_to_quats` | R | Encode un NOMBRE en séquence de quats (directions QPath 0..3). bits = précision (défaut 8). |
| `vsa_nearest_symbol` | R | Parmi des SYMBOLES candidats, lequel est le plus proche d'un symbole requête (clean-up memory VSA). Renvoie le nom du plus proche. |
| `vsa_symbol_distance` | R | Distance de Hamming entre les hypervecteurs de deux SYMBOLES (chaînes). ~0 = identiques, ~dim/2 = orthogonaux. |

### Règles (`rules`, 13)

| Tool | RW | Description |
|---|---|---|
| `rules_add` | W | Ajoute une règle en DSL : « SUJET PRÉDICAT OBJET ; … =&gt; SUJET PRÉDICAT OBJET ». Variables = majuscules (X, Y, Z), « ; » entre conditions, « =&gt; » avant la conclusion. Ex: "X est humain =&gt; X est mortel". Renvoie la règle, ou null si invalide. |
| `rules_add_natural` | W | Ajoute une règle depuis le LANGAGE NATUREL (« Tout humain est mortel », « Si une personne est majeure alors elle peut voter »). Convertit en DSL via NaturalRuleParser puis ajoute. null si non reconnu. |
| `rules_apply_all` | W | Chaînage avant jusqu'au point fixe : applique toutes les règles, écrit les faits déduits. Renvoie le nombre de faits dérivés. |
| `rules_clear` | W | Efface toutes les règles et dérivations. |
| `rules_edit` | W | Réécrit une règle (re-validée). Renvoie true si appliqué. |
| `rules_list` | R | Liste toutes les règles. |
| `rules_list_derived` | R | Tous les faits dérivés (déduits par les règles). |
| `rules_parse` | R | Parse une règle DSL en {conditions, conclusions} SANS l'ajouter (aperçu/validation). null si invalide. |
| `rules_remove` | W | Supprime une règle par id. Renvoie true si supprimée. |
| `rules_retract_and_rederive` | W | TMS : rétracte un fait prémisse puis re-dérive pour retirer les orphelins. Renvoie {premiseRetracted, orphansRemoved}. |
| `rules_stats` | R | Compteurs : totalRules, activeRules, derivedFacts. |
| `rules_toggle` | W | Active/désactive une règle par id. Renvoie le nouvel état. |
| `rules_why_derived` | R | Provenance d'un fait dérivé : par quelle règle / prémisses. undefined si non dérivé. |

### Grand livre (`ledger`, 9)

| Tool | RW | Description |
|---|---|---|
| `ledger_balance` | R | Solde CALCULÉ d'un compte (repli des mouvements). 0 token. |
| `ledger_block` | W | Bloque un compte (gèle les opérations). reason optionnelle. |
| `ledger_close` | W | Ferme un compte. reason optionnelle. |
| `ledger_deposit` | W | Dépose un montant sur un compte (mouvement append-only). Renvoie le résultat (nouveau solde, id…). |
| `ledger_movements` | R | Journal des mouvements (faits) d'un compte. |
| `ledger_open` | W | Ouvre un compte. unit (ex USD/pts/kWh), initialBalance, floor (plancher, défaut 0 = pas de découvert), ceiling (plafond) optionnels. |
| `ledger_transfer` | W | Transfère un montant d'un compte à un autre (atomique : retrait + dépôt). |
| `ledger_unblock` | W | Débloque un compte. |
| `ledger_withdraw` | W | Retire un montant (refusé si ça passe sous le plancher). Renvoie le résultat. |

### Faits compagnons (`companion`, 8)

| Tool | RW | Description |
|---|---|---|
| `companion_attach` | W | Rattache un fait (s,p,o) à un propriétaire entité (profil). cascade:true -&gt; la rétractation du propriétaire cascade aux compagnons. Renvoie le factId. |
| `companion_detach` | W | Retire les drapeaux de compagnon d'un fait (il n'appartient plus à un profil). |
| `companion_of` | R | Tous les faits compagnons d'un propriétaire entité. |
| `companion_owner_of` | R | Propriétaire d'un fait (s'il est compagnon), ou null. |
| `companion_profile` | R | Profil d'une entité : ses faits compagnons groupés par prédicat (Record&lt;prédicat, valeurs[]&gt;). |
| `companion_retract_owner` | W | Rétracte un propriétaire et cascade (1 niveau) à ses compagnons. Renvoie {retracted}. |
| `companion_retract_tree` | W | Rétracte un propriétaire et cascade RÉCURSIVEMENT (tout l'arbre de compagnons). Renvoie {retracted}. |
| `companion_tag` | W | Marque un fait EXISTANT comme compagnon d'un propriétaire entité (sans le réécrire). |

### Déduction générative (`generative`, 8)

| Tool | RW | Description |
|---|---|---|
| `gen_analogize` | W | Déduit l'objet de (s, p) par ANALOGIE / proximité, en comblant les trous (mis en QUARANTAINE, pas écrits). Renvoie un GenResult avec trace. |
| `gen_inherit` | W | Déduit l'objet de (s, p) par HÉRITAGE de classe (+ comblement en quarantaine). GenResult + trace. |
| `gen_pending_promotions` | R | Faits déduits EN QUARANTAINE en attente de validation (promotion ou rejet). |
| `gen_promote` | W | Promeut un fait de la quarantaine vers la KB (le valide). Renvoie true si promu. |
| `gen_reject` | W | Rejette (supprime de la quarantaine) un fait déduit. Renvoie true si présent. |
| `gen_resolve_synonym` | W | Résout un terme vers une entité connue (variante/synonyme), avec comblement éventuel. GenResult. |
| `gen_synthesize` | R | Génère n lignes synthétiques PLAUSIBLES : chaque champ est tiré selon la fréquence observée dans la KB. schema = {fields:[{...}]}. Reproductible (RNG seedé du générateur). |
| `gen_verify` | R | Vérifie si un fait (s,p,o) est SUPPORTÉ / CONTREDIT / INCONNU par la base (sans rien écrire). support:true pour le détail des appuis. |

### Grille QPath brute (`grid`, 4)

| Tool | RW | Description |
|---|---|---|
| `grid_count_nodes` | R | Nombre de nœuds de la grille (taille / coût mémoire). |
| `grid_find_values` | R | Cherche dans la grille les valeurs stockées dont le texte contient la requête (BFS borné). |
| `grid_generate` | R | Génération stochastique ANCRÉE : marche pondérée par la fréquence de traversée -&gt; ne produit que des valeurs réellement stockées. temperature règle l'aléa. |
| `grid_process_data` | W | Encode une donnée (primitive/objet/tableau) en bits -&gt; quats -&gt; marche directionnelle, et la stocke dans la grille (préfixes partagés -&gt; généralisation). |

### Flux fact-driven (`flow`, 5)

| Tool | RW | Description |
|---|---|---|
| `flow_collect_facts` | R | Tous les faits de STRUCTURE d'un flux (par traversée). Pour inspecter le « code » du flux. |
| `flow_delete` | W | Rétracte (archive) TOUT le flux d'un coup. Renvoie le nombre de faits rétractés. |
| `flow_run` | W | Exécute un flux nommé depuis son entrée (conditions = lectures KB 0 token ; actions = ToolRegistry). Borné (maxSteps). Renvoie la TRACE des étapes. NB : les actions nécessitent un registre d'outils côté hôte. |
| `flow_tag` | W | Tague les faits d'un flux comme compagnons de « flow:&lt;nom&gt; » (le flux devient une unité). cascade:true pour la rétractation en cascade. Renvoie le nombre tagué. |
| `flow_validate` | R | Valide un flux AVANT exécution/promotion : refuse boucle non bornée, lien mort, condition incomplète, outil interdit. Renvoie {ok, errors…}. |

### Routage d’intention (`intent`, 4)

| Tool | RW | Description |
|---|---|---|
| `intent_extract_features` | R | Extrait les traits STRUCTURELS d'un message (question, mot interrogatif, inversion, copule, négation, 1ʳᵉ/2ᵉ personne, formes email/url/nombre/date…). Fonction pure. |
| `intent_learn` | W | Apprend un exemplaire (intention, exemple). provisional:true = issu d'un LLM (poids &lt; 1 jusqu'à confirmation). |
| `intent_route` | R | Route un message vers une intention ; si ambigu ET un port LLM est configuré, le LLM tranche (sinon "unknown"). Renvoie {intent, confidence, via}. |
| `intent_route_offline` | R | Route un message vers une intention en 0 token (structure + trigrammes, AUCUN LLM). Renvoie {intent, confidence, via}. "unknown" si ambigu. |
