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

```ts
// Sur les objets d'un (sujet, prédicat) :
kb.aggregate('classe', 'note', 'avg');      // moyenne
kb.aggregate('classe', 'note', 'median');   // médiane
kb.aggregate('classe', 'note', 'stddev');   // écart-type

// Transverse, sur tous les sujets porteurs d'un prédicat :
kb.aggregateAll('age', 'avg');              // âge moyen de tout le monde

// Tout d'un coup :
kb.stats('classe', 'note');
// → { count, sum, avg, min, max, median, variance, stddev, range }
```

Fonctions disponibles : **`count` · `sum` · `avg` · `min` · `max` · `median` · `variance` · `stddev`
· `range`**. Et pour interroger : `kb.askNumeric('age', '>', 18)` (« qui a plus de 18 ans ? »),
`kb.numericValueOf(s, p)`, `kb.compareNumeric(s1, s2, p)`.

## En une phrase

Un seul type (le triplet), deux axes (**6 drapeaux** × **7 provenances**), **4 faits spéciaux** de
raisonnement, et **9 calculs** sur les objets numériques — le tout manipulable par une interface
unique, `kb.fact(...)`, par triplet ou par id.
