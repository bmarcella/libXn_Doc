# Types de faits

Il y a **un seul type fondamental** : le **fait = triplet `(sujet, prédicat, objet)`**. Par-dessus,
deux axes l'enrichissent — un **drapeau** (son rôle) et une **provenance** (son origine) — plus
quelques **faits spéciaux** (sémantique de raisonnement) et des **calculs** sur les objets numériques.

## Créer & manipuler : le handle `kb.fact(...)`

Une seule interface, chaînable, **par triplet ou par id** — plus besoin de re-passer le triplet.

```ts
// CRÉER : fait + provenance + drapeaux EN UN APPEL
const f = await kb.fact('alice', 'aime', 'café')
  .from({ kind: 'user' })   // provenance
  .closed().major()         // drapeaux
  .save();                  // écrit tout
f.id;                       // 'f…' — identifiant déterministe

// MANIPULER PAR ID (zéro re-passage du triplet)
kb.fact(f.id).setFlags({ major: false });
kb.fact(f.id).flags();      // { closed: true }
kb.fact(f.id).sources();    // la provenance
kb.fact(f.id).retract('périmé');

kb.tripletOf(f.id);         // { s, p, o } d'un id
```

**Les appels en détail.** Le handle a **deux façons de désigner un fait** : par triplet
(`kb.fact(s, p, o)`) à la création, ou par id (`kb.fact(id)`) une fois qu'il existe.

- `kb.fact(s, p, o)` / `kb.fact(id)` — ouvre le handle. La forme **3 arguments** vise un triplet
  (sujet, prédicat, objet) — tous obligatoires et castés en chaîne. La forme **1 argument** prend l'**id
  déterministe** d'un fait déjà connu et lève une erreur si l'id est inconnu. Retour : un `FactRef`
  chaînable (rien n'est écrit tant que `.save()` n'est pas appelé).
- `.from(source)` — attache la **provenance** à l'écriture à venir. `source` est un objet `FactSource`
  (voir l'axe « provenance » ci-dessous) ; seul `kind` est obligatoire.
- `.closed(v?)` / `.major(v?)` — posent un drapeau. L'argument booléen est **optionnel et vaut `true`**
  par défaut ; passe `false` pour retirer le drapeau (ex. `.major(false)`).
- `.group(g)` — rattache le fait au groupe d'accès nommé `g` (chaîne obligatoire).
- `.save()` — écrit le triplet **+** sa provenance **+** ses drapeaux en attente, en un seul appel.
  C'est `async` (la persistance peut être distante) : `await`-le. Retour : le même `FactRef` (chaînable) ;
  `f.id` est alors l'identifiant déterministe.

| Méthode du handle (par id) | Argument | Rôle | Retour |
|---|---|---|---|
| `.setFlags(flags)` | objet `FactFlags` partiel (`{ closed?, major?, secret?, group?, … }`) — **fusionné** avec l'existant | pose/modifie des drapeaux **immédiatement** (sans re-écrire le triplet) | le handle |
| `.flags()` | *(aucun)* | lit les drapeaux courants | `FactFlags` (`{}` si aucun) |
| `.sources()` | *(aucun)* | lit la provenance | `FactSource[]` |
| `.retract(reason?)` | raison optionnelle (chaîne, archivée) | rétracte le fait (archivé, **jamais** effacé) | `boolean` — `true` s'il existait |
| `kb.tripletOf(id)` | l'id déterministe | retrouve le triplet d'un id | `{ s, p, o }` ou `undefined` si l'id est inconnu |

> 💡 `.save()` est **asynchrone**, mais `.setFlags()` / `.flags()` / `.sources()` / `.retract()` sont
> **synchrones** (ils opèrent sur l'index en mémoire). N'`await` que `.save()` (et `kb.tell`).

> Le plus simple : `await kb.tell('alice', 'aime', 'café')` reste valable pour un fait nu. `kb.fact()`
> est la version unifiée quand tu veux provenance, drapeaux ou l'id en retour. Signature complète :
> `kb.tell(s, p, o, source?, flags?)` — les 4ᵉ/5ᵉ arguments (provenance, drapeaux) sont optionnels, et
> `tell` retourne une `Promise<ContradictionReport | null>` (non `null` si l'opposé exact `p ↔ not_p`
> existe déjà).

## Axe « drapeau » — le rôle du fait

Posés via le handle (`.closed()/.major()/.group()`) ou `kb.setFlags(...)`. Lus via `kb.fact(id).flags()`.

| Drapeau | Sert à | Posé par |
|---|---|---|
| *(aucun)* | fait ordinaire | par défaut |
| **`closed` 🔒** | **décidé** : sort de la revérification, gagne face à une contestation | `.closed()` |
| **`major` ⭐** | **structurant** : prioritaire dans le RAG / les alertes | `.major()` |
| **`secret` 🔑** | **confidentiel** : chiffré au repos, masqué des lectures normales | [`FactVault.setSecret`](/access-layer) |
| **`group`** | rattaché à un **groupe d'accès** (permissions) | `.group('finances')` / [`FactAccessControl`](/access-layer) |
| **`companionOf`** | **fait compagnon** d'un propriétaire (profil) | [`CompanionFacts.attach`](/components) |
| **`cascade`** | le compagnon **suit la rétractation** de son propriétaire | [`CompanionFacts.attach`](/components)`({ cascade: true })` |

## Axe « provenance » — l'origine du fait

Le 4ᵉ argument (`source`) — sert à la **traçabilité** et à la **fraîcheur** (revérification).

```ts
await kb.fact('alice', 'ville', 'paris').from({ kind: 'document', ref: 'cv.pdf' }).save();
kb.fact(id).sources();   // [{ kind: 'document', ref: 'cv.pdf', at: … }]
```

L'objet `source` passé à `.from(...)` (type `FactSource`) :

| Champ | Rôle | Défaut |
|---|---|---|
| `kind` | **obligatoire** — la nature de l'origine (voir la liste ci-dessous) | — |
| `ref?` | référence libre : URL, id de document, nom d'outil… | — (aucune) |
| `at?` | timestamp epoch (ms) de l'enregistrement | **maintenant** (`Date.now()`) si omis |
| `confidence?` | confiance portée par cette source, entre `0` et `1` | — (non pondérée) |
| `display?` | forme d'**affichage verbatim** de l'objet (casse/accents préservés) — l'objet stocké est normalisé en minuscules, ce champ garde l'original pour l'UI | — |

> 💡 Plusieurs `.save()`/`tell` du même triplet **n'écrasent pas** la provenance : ils **empilent** les
> sources. `kb.fact(id).sources()` renvoie donc un tableau (chaque entrée porte son propre `at`).

Valeurs possibles de `kind` : `user` · `document` · `web` · `tool` · `llm-verified` · `inference` · `import`.

## Faits spéciaux (sémantique de raisonnement)

| Type | Sert à | Créer | Utiliser |
|---|---|---|---|
| **Négation** `not_p` | **nier** (preuve, pas une absence) | `kb.fact('pingouin','not_vole','vrai').save()` | `kb.checkInherited(...)` → `'no'` |
| **Identité** `même_que` | deux noms = même entité | `kb.mergeEntities('bob','robert')` | lectures fusionnées |
| **Non-identité** `distinct_de` | « pas le même Jean » | `kb.splitEntity(...)` | bloque une fusion |
| **Classe** `est` | `chat est animal` → héritage | `kb.fact('chat','est','animal').save()` | `kb.classesOf`, `kb.askInherited` |

**Les opérations de ce tableau, en détail :**

- `kb.mergeEntities(a, b, source?)` — déclare que deux noms désignent la **même** entité. `a` et `b` sont
  les deux sujets (chaînes obligatoires) ; `source` est une provenance `FactSource` optionnelle (défaut :
  `{ kind: 'user', ref: 'fusion' }`). Retour : `Promise<boolean>` — `false` si la fusion est **refusée**
  (mêmes noms, ou une non-identité `distinct_de` existe déjà entre eux), `true` sinon.
- `kb.splitEntity(from, factsToMove, opts?)` — scinde une entité en deux (« pas le même Jean »). `from`
  est le sujet d'origine ; `factsToMove` est la **liste des faits à déplacer** vers la nouvelle entité,
  chacun `{ p, o }` (le sujet est implicitement `from`) ; `opts` est optionnel —
  `{ discriminantNew?, discriminantOld? }` pose un libellé lisible sur chaque entité. Retour :
  `Promise<string>` — l'**id du nouveau sujet** créé. Les faits déplacés sont rétractés côté `from`
  (archivés, pas effacés) et un `distinct_de` est posé dans les **deux** sens.
- `kb.checkInherited(s, p, o, maxDepth?)` — vérifie un triplet **avec héritage et exceptions**. Les trois
  premiers arguments sont le triplet à tester ; `maxDepth` borne la remontée d'héritage (défaut **6**).
  Retour : `{ verdict: 'yes' | 'no' | 'unknown'; answer? }` — `'yes'` (affirmé, direct ou hérité),
  `'no'` (**nié** par un `not_p` — une preuve, pas une absence), `'unknown'` (indécidable).
- `kb.classesOf(s, maxDepth?)` / `kb.askInherited(s, p, maxDepth?)` — remontent la chaîne de classes
  (`est`) ; `maxDepth` borne la profondeur (défaut **6**).

> ⚠️ Pour **changer** un fait de classe à valeur unique, `retract` puis `tell` : un simple second `tell`
> **ajoute** une valeur au lieu de remplacer la précédente.

## Objets numériques — calculs

Quand l'objet est un nombre (`'30'`, `'1,5'`, `'60 kg'`…), QPath sait calculer dessus, **sans token**.
Tu **cibles** les faits voulus par un **filtre `{ s?, p?, o? }`** (chaque champ absent = joker), puis
tu calcules.

### Comparateurs (sur sujet, prédicat, objet)

Chaque champ accepte soit une **chaîne** (égalité), soit un **comparateur** `{ op, value }` :
`=` · `!=` · `<` · `<=` · `>` · `>=` (sur la valeur numérique) · `like` (sous-chaîne) · `in` (liste).

```ts
kb.compute({ p: 'age', o: { op: '>', value: 18 } }, 'count');        // combien de majeurs
kb.compute({ p: 'age', o: { op: '>=', value: 25 } }, 'avg');          // âge moyen des ≥ 25
kb.matchFacts({ s: { op: 'in', value: ['alice', 'bob'] } });          // faits d'alice OU bob
kb.compute({ p: 'email', o: { op: 'like', value: '@gmail' } }, 'count'); // emails gmail
kb.matchFacts({ p: 'prix', o: { op: '!=', value: '0' } });           // prix non nuls
```

Un **comparateur** est l'objet `{ op, value }` accepté à la place d'une chaîne dans `s`, `p` ou `o` :

- `op` — l'opérateur : `=` · `!=` · `<` · `<=` · `>` · `>=` (sur la valeur **numérique** du champ) ·
  `like` (sous-chaîne, insensible à la casse) · `in` (appartenance à une liste).
- `value` — la valeur de comparaison. Une **chaîne ou un nombre** pour la plupart des opérateurs ; un
  **tableau** (`['alice', 'bob']`) pour `in`. Pour `<` `<=` `>` `>=`, la valeur du champ est parsée en
  nombre — un champ non numérique ne matche jamais.

> 💡 Une **chaîne nue** (`{ p: 'age' }`) est un raccourci pour l'**égalité exacte** (`{ op: '=' }`) ;
> un champ **absent** est un **joker** (tous). `{ s?, p?, o? }` se lit donc « ces contraintes-là, le
> reste libre ».

```ts
// compute(filtre, fonction) — le point d'entrée
kb.compute({ p: 'age' }, 'avg');                  // moyenne des âges de TOUT le monde
kb.compute({ s: 'classe', p: 'note' }, 'median'); // médiane des notes d'une classe
kb.compute({ s: 'alice' }, 'sum');                // somme de tous les objets numériques d'alice
kb.compute({ p: 'prix', o: '100' }, 'count');     // combien de prix valent 100

// Toutes les stats d'un coup, avec le même filtre :
kb.stats({ p: 'age' });
// → { count, sum, avg, min, max, median, variance, stddev, range }

// La sélection brute (les faits qui matchent) :
kb.matchFacts({ p: 'age', o: '40' });             // [{ s, p, o }, …]
```

**Les trois points d'entrée, en détail :**

- `kb.compute(filtre, fn)` — applique **une** fonction d'agrégat aux objets numériques des faits
  filtrés. `filtre` est un `{ s?, p?, o? }` (chaque champ absent = joker) ; `fn` est l'une des 9
  fonctions ci-dessous. Retour : `number | undefined` (**`undefined`** si aucun fait numérique ne
  matche). Cas particulier : `'count'` compte les **faits** (pas seulement les numériques).
- `kb.stats(filtre)` — calcule **toutes** les statistiques d'un coup avec le même filtre. Un seul
  argument (le filtre). Retour : un objet `{ count, sum, avg, min, max, median, variance, stddev, range }`,
  ou **`undefined`** si aucun objet numérique ne matche.
- `kb.matchFacts(filtre)` — la **sélection brute** : renvoie les faits qui matchent, sous la forme
  `Array<{ s, p, o }>` (tableau vide si rien). C'est la base de `compute`/`stats` et des fonctions texte.

> ⚠️ `compute`/`stats`/fonctions texte **excluent** par défaut le vocabulaire moteur (`excludeReserved`
> implicite à `true`). `matchFacts` **brut** reste **inclusif** sauf si tu passes `excludeReserved: true`
> dans le filtre.

> **Vocabulaire moteur exclu par défaut.** Les calculs et fonctions texte **ignorent** les faits dont
> le prédicat est interne (`même_que`, `distinct_de`, `not_*`, `est`/`est_un`/`is`) — `compute({ s: 'bob' })`
> ne compte pas les `même_que` créés par une fusion. Pour les réintégrer : `{ …, excludeReserved: false }`.
> Test direct : `KnowledgeBase.isReservedPredicate('même_que') // true`.

Fonctions (valeurs possibles de `fn`) : **`count` · `sum` · `avg` · `min` · `max` · `median` ·
`variance` · `stddev` · `range`** (variance/écart-type **populationnels**).

**Raccourcis et requêtes numériques, en détail :**

- `kb.aggregate(s, p, fn)` — = `compute({ s, p }, fn)`. Agrège les objets d'un couple (sujet, prédicat).
  Retour : `number | undefined`.
- `kb.aggregateAll(p, fn)` — = `compute({ p }, fn)`. Agrège transversalement tous les sujets porteurs du
  prédicat `p`. Retour : `number | undefined`.
- `kb.askNumeric(p, op, value, value2?)` — « quels sujets vérifient (p) `op` valeur ? ». `op` est un
  opérateur numérique (`>` `>=` `<` `<=` `=` `!=` `between`) ; `value2` n'est requis **que** pour
  `between` (inclusif). Retour : `NumericMatch[]` = `Array<{ subject, value }>`, **trié par valeur
  croissante**.
- `kb.numericValueOf(s, p)` — la **première** valeur numérique de (s, p). Retour : `number | undefined`
  (`undefined` si aucun objet n'est numérique).
- `kb.compareNumeric(s1, s2, p)` — compare deux sujets sur un prédicat numérique. Retour : le **signe**
  de (v1 − v2) — `-1`, `0` ou `1` — ou `undefined` si l'un des deux manque.

## Objets alphanumériques — fonctions texte

Quand l'objet est du **texte**, le même filtre `{ s?, p?, o? }` donne des fonctions adaptées.

```ts
kb.distinctValues({ p: 'ville' });        // valeurs uniques triées → ['lyon', 'paris']
kb.frequencies({ p: 'ville' });           // histogramme → { paris: 2, lyon: 1 }
kb.mode({ p: 'ville' });                   // la plus fréquente → 'paris'
kb.longest({ p: 'nom' });                  // l'objet le plus long
kb.shortest({ p: 'nom' });                 // le plus court
kb.concat({ s: 'alice', p: 'aime' }, ' | '); // 'café | thé | lecture'
kb.matchCount({ p: 'email' }, '@gmail');   // combien d'objets contiennent une sous-chaîne
```

| Fonction | Renvoie | Sert à |
|---|---|---|
| `distinctValues(filtre)` | `string[]` | les valeurs uniques (triées) |
| `frequencies(filtre)` | `Record<string, number>` | un **histogramme** (valeur → nombre) |
| `mode(filtre)` | `string` | la valeur la plus fréquente |
| `concat(filtre, sep?)` | `string` | concaténer les objets |
| `longest` / `shortest(filtre)` | `string` | par longueur de chaîne |
| `matchCount(filtre, sous-chaîne)` | `number` | combien contiennent un motif (insensible à la casse) |

Toutes prennent le **même** `filtre` `{ s?, p?, o? }` que `compute`/`stats` (premier argument). Les deux
qui ont un **second** argument :

- `concat(filtre, sep?)` — `sep` est le séparateur, **`', '` par défaut** ; passe `' | '` pour changer.
- `matchCount(filtre, substring)` — `substring` (chaîne **obligatoire**) est le motif cherché dans les
  objets ; la comparaison est **insensible à la casse**.

> 💡 `mode` / `longest` / `shortest` renvoient `undefined` si la sélection est vide ; `distinctValues`
> renvoie `[]` et `frequencies` renvoie `{}`.

## Symboles développeur — réagir à l'écriture

Tu peux **« réclamer » un token** (sujet, prédicat ou objet) et y brancher une logique déclenchée
**à l'écriture** — sans namespace réservé, sans toucher au reste de la base.

```ts
kb.defineSymbols({
  predicates: [{
    name: 'solde',
    validate: (c) => /^\d+$/.test(c.o) || 'le solde doit être un nombre',  // VÉTO avant écriture
  }],
  subjects: [{
    name: 'commande',
    onWrite: (c) => { void c.kb.tell(c.s, 'statut', 'reçue'); },            // EFFET après écriture
  }],
});

await kb.fact('compte', 'solde', 'abc').save();  // ❌ SymbolValidationError — rien posé
await kb.fact('compte', 'solde', '100').save();  // ✅
```

`kb.defineSymbols(spec)` prend **un seul** argument, un objet à trois clés **toutes optionnelles** —
`{ subjects?, predicates?, objects? }` — chacune un tableau de `DeveloperSymbol` :

| Champ d'un `DeveloperSymbol` | Rôle | Défaut |
|---|---|---|
| `name` | **obligatoire** — le token réclamé (normalisé) | — |
| `description?` | libellé libre (doc/introspection) | — |
| `validate?(ctx)` | **véto** synchrone avant écriture | — (pas de véto) |
| `onWrite?(ctx)` | **effet de bord** après écriture | — (aucun) |

L'appel est **idempotent et cumulatif** : ré-enregistrer un même `name` écrase le précédent, et les
appels successifs s'additionnent. Retour : `void`.

| Hook | Quand | Rôle |
|---|---|---|
| `validate(ctx)` | **avant** écriture | `true` accepte ; `false` ou une raison (`string`) **refuse** (lève `SymbolValidationError`) |
| `onWrite(ctx)` | **après** écriture | effet de bord : dériver un fait, auditer, indexer… |

`ctx = { role, token, s, p, o, source, kb }`. Introspection : `kb.symbolOf(role, token)`,
`kb.isDeveloperSymbol(role, token)`.

> Pas de réécriture silencieuse du triplet (incohérente avec la persistance) : pour **normaliser**,
> refuse l'entrée non conforme, ou dérive la forme corrigée dans `onWrite`.

## Faits uniques — contraintes d'unicité

Par défaut un `(sujet, prédicat)` est **multi-valué** : `alice aime thé` puis `alice aime café`
coexistent. Mais certains prédicats sont **fonctionnels** : un email n'a qu'un id, une personne qu'une
date de naissance. Tu peux **déclarer une contrainte d'unicité** sur un prédicat ; elle est alors
vérifiée à **chaque écriture**, avant que le fait ne soit posé.

```ts
kb.declareUnique('has_name',  'leftUnique');                          // 1 objet par sujet
kb.declareUnique('has_email', 'rightUnique');                        // 1 sujet par objet
kb.declareUnique('has_id',    'fullUnique');                         // bijection (les deux)
kb.declareUnique('statut',    'leftUnique', { onConflict: 'replace' }); // le dernier gagne
```

Les **trois formes** d'unicité (selon ce qui sert de clé) :

| `kind` | Clé | Garantit | Exemple |
|---|---|---|---|
| `leftUnique` | le **sujet** | `(s, p)` n'a qu'**un** objet (*fonctionnel*) | `b@gmail.com has_name Jean` — un email → un seul nom |
| `rightUnique` | l'**objet** | `(p, o)` n'a qu'**un** sujet (*inverse-fonctionnel*, ≈ `UNIQUE` en base) | `Jean has_email b@gmail.com` — un email appartient à une seule personne |
| `fullUnique` | les **deux** | fonctionnel **et** inverse-fonctionnel (*bijection / clé*) | `b@gmail.com has_id 1234` — un email ↔ un id |

`kb.declareUnique(predicate, kind, opts?)` prend :

| Argument | Rôle | Défaut |
|---|---|---|
| `predicate` | le prédicat contraint (normalisé) | — |
| `kind` | `'leftUnique'` \| `'rightUnique'` \| `'fullUnique'` | — |
| `opts.onConflict?` | que faire si une **valeur différente** existe déjà (voir ci-dessous) | `'reject'` |

**Politique de conflit** (`onConflict`) — déclenchée seulement quand une valeur **différente** entre en conflit :

| Politique | Effet |
|---|---|
| `reject` (défaut) | refuse l'écriture : `tell` **lève `UniquenessError`**, l'existant est conservé. Rien n'est perdu. |
| `replace` | archive l'(les) ancienne(s) valeur(s) en conflit (rétractées → [historique](/fact-provenance)) puis écrit la neuve. |
| `report` | écrit quand même et **renvoie un `UniquenessReport`** (`tell` → `{ kind: 'uniqueness', conflicts: [...] }`), à toi de trancher. |

```ts
kb.declareUnique('has_email', 'rightUnique');           // défaut: reject
await kb.tell('alice', 'has_email', 'a@x.com');         // ✅
await kb.tell('bob',   'has_email', 'a@x.com');         // ❌ UniquenessError (email déjà pris)
await kb.tell('alice', 'has_email', 'a@x.com');         // ✅ idempotent — même fait, pas un conflit
```

À retenir :

- **Idempotence** : réasserter le **même** triplet n'est jamais un conflit (ça ajoute juste une source).
- **`closed` prime** : si la valeur existante est verrouillée (🔒 `closed`), toute écriture concurrente est **rejetée**, même sous `replace`.
- **Rétrocompatible** : sans `declareUnique`, le prédicat reste multi-valué (rien ne change).
- **`tell` renvoie** désormais soit une contradiction de négation, soit une violation d'unicité — distinguées par `report.kind` (`'negation'` vs `'uniqueness'`).
- **À déclarer au démarrage** (comme `defineSymbols`) ; pour une unicité **globale inter-tenant**, c'est l'index `unique` côté [persistance](/persistence) qui s'en charge (les deux se composent).

### Portée & gouvernance — qui possède quelle clé

Une contrainte porte un **tier** (`declareUnique(pred, kind, { tier })`), calqué sur les [anneaux de mémoire](/layers) :

| Tier | Qui | Portée |
|---|---|---|
| `global` | le **système** : dev (codé en dur) + admin plateforme | s'applique dans **chaque** scope |
| `tenant` | un **org / user** (créées en UI, avec libellé/description) | s'applique **uniquement à son scope**, isolé |

Deux règles découlent de cette séparation :

- **Espaces séparés** : une déclaration `tenant` sur un prédicat déjà possédé en `global` est **ignorée** — un tenant ne peut ni redéfinir ni affaiblir une règle système (ex. il ne peut pas retirer l'unicité de `has_email`). Il ne contraint que **ses propres** prédicats.
- **Isolation** : l'unicité est vérifiée contre **les seules données du scope qui écrit**. Deux organisations peuvent donc avoir la même valeur sans conflit — « global » qualifie la *règle*, pas la *valeur*.

Comme les org/user créent les leurs depuis l'UI, une contrainte peut vivre **en tant que faits** (scopée par anneau, descriptible) plutôt qu'en code :

```ts
// Écrit (predicat, cardinality, kind) [+ on_conflict, + unique_label] dans l'anneau courant :
await kb.declareUniqueAsFacts('matricule', 'fullUnique', { onConflict: 'reject', label: 'Matricule interne' });
// À l'hydratation d'un scope, on traduit ces méta-faits en contraintes (generic en 'global', org/user en 'tenant') :
kb.loadUniqueConstraints({ tier: 'tenant' });
```

## En une phrase

Un seul type (le triplet), deux axes (**6 drapeaux** × **7 provenances**), **4 faits spéciaux** de
raisonnement, des **contraintes d'unicité** par prédicat, **9 calculs** numériques et des **fonctions
texte** (distinct, fréquences, mode…) — le tout par filtre `{ s?, p?, o? }`, et manipulable via une
interface unique, `kb.fact(...)`.
