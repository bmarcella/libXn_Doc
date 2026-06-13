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

> Le plus simple : `await kb.tell('alice', 'aime', 'café')` reste valable pour un fait nu. `kb.fact()`
> est la version unifiée quand tu veux provenance, drapeaux ou l'id en retour.

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

## Axe « provenance » — l'origine du fait

Le 4ᵉ argument (`source`) — sert à la **traçabilité** et à la **fraîcheur** (revérification).

```ts
await kb.fact('alice', 'ville', 'paris').from({ kind: 'document', ref: 'cv.pdf' }).save();
kb.fact(id).sources();   // [{ kind: 'document', ref: 'cv.pdf', at: … }]
```

`user` · `document` · `web` · `tool` · `llm-verified` · `inference` · `import`.

## Faits spéciaux (sémantique de raisonnement)

| Type | Sert à | Créer | Utiliser |
|---|---|---|---|
| **Négation** `not_p` | **nier** (preuve, pas une absence) | `kb.fact('pingouin','not_vole','vrai').save()` | `kb.checkInherited(...)` → `'no'` |
| **Identité** `même_que` | deux noms = même entité | `kb.mergeEntities('bob','robert')` | lectures fusionnées |
| **Non-identité** `distinct_de` | « pas le même Jean » | `kb.splitEntity(...)` | bloque une fusion |
| **Classe** `est` | `chat est animal` → héritage | `kb.fact('chat','est','animal').save()` | `kb.classesOf`, `kb.askInherited` |

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

> **Vocabulaire moteur exclu par défaut.** Les calculs et fonctions texte **ignorent** les faits dont
> le prédicat est interne (`même_que`, `distinct_de`, `not_*`, `est`/`est_un`/`is`) — `compute({ s: 'bob' })`
> ne compte pas les `même_que` créés par une fusion. Pour les réintégrer : `{ …, excludeReserved: false }`.
> Test direct : `KnowledgeBase.isReservedPredicate('même_que') // true`.

Fonctions : **`count` · `sum` · `avg` · `min` · `max` · `median` · `variance` · `stddev` · `range`**.
Raccourcis : `kb.aggregate(s, p, fn)` = `compute({ s, p }, fn)` · `kb.aggregateAll(p, fn)` =
`compute({ p }, fn)`. Et pour interroger : `kb.askNumeric('age', '>', 18)` (« qui a plus de 18 ans ? »),
`kb.numericValueOf(s, p)`, `kb.compareNumeric(s1, s2, p)`.

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

| Hook | Quand | Rôle |
|---|---|---|
| `validate(ctx)` | **avant** écriture | `true` accepte ; `false` ou une raison (`string`) **refuse** (lève `SymbolValidationError`) |
| `onWrite(ctx)` | **après** écriture | effet de bord : dériver un fait, auditer, indexer… |

`ctx = { role, token, s, p, o, source, kb }`. Introspection : `kb.symbolOf(role, token)`,
`kb.isDeveloperSymbol(role, token)`.

> Pas de réécriture silencieuse du triplet (incohérente avec la persistance) : pour **normaliser**,
> refuse l'entrée non conforme, ou dérive la forme corrigée dans `onWrite`.

## En une phrase

Un seul type (le triplet), deux axes (**6 drapeaux** × **7 provenances**), **4 faits spéciaux** de
raisonnement, **9 calculs** numériques et des **fonctions texte** (distinct, fréquences, mode…) — le
tout par filtre `{ s?, p?, o? }`, et manipulable via une interface unique, `kb.fact(...)`.
