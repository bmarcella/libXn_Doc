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

## En une phrase

Un seul type (le triplet), deux axes (**6 drapeaux** × **7 provenances**), **4 faits spéciaux** de
raisonnement, **9 calculs** numériques et des **fonctions texte** (distinct, fréquences, mode…) — le
tout par filtre `{ s?, p?, o? }`, et manipulable via une interface unique, `kb.fact(...)`.
