# Provenance & revérification

Un fait n'est pas juste « vrai » : il vient de quelque part, à un moment donné — et **il peut être
vrai aujourd'hui et faux demain**. QPath attache donc à chaque fait sa **provenance** (qui, quand,
d'où), en dérive une **fraîcheur**, et sait **revérifier** un fait périmé par le canal même qui
l'avait produit.

> **Chaque fait sait d'où il vient. Sa source dit comment le revérifier. Et rien n'est jamais
> effacé : la mémoire devient temporelle.**

> 🎯 **Cas d'usage.** « L'email de ce client est-il encore valable ? » Un fait vrai il y a huit mois peut
> être périmé. QPath sait **d'où** vient chaque fait (quelle source, quand), en déduit sa **fraîcheur**, et
> peut le **revérifier** par le canal qui l'avait produit. Le problème résolu : distinguer un fait *frais*
> d'un fait *périmé*, et pouvoir répondre « je le sais depuis telle source, à telle date ».

## La provenance : chaque fait a ses sources

`tell` accepte une source optionnelle — type d'origine (`kind`), référence (`ref` : URL, id de
document, nom d'outil…), horodatage, confiance :

```ts
await kb.tell('marcella', 'travaille_chez', 'damba', { kind: 'user' });
await kb.tell('bitcoin', 'vaut', '60000', { kind: 'web', ref: 'https://exemple.org/cours' });

kb.sourcesOf('bitcoin', 'vaut', '60000');
// → [{ kind: 'web', ref: 'https://exemple.org/cours', at: 1760000000000 }]
```

**Les arguments de `tell(s, p, o, source?, flags?)`** — les trois premiers sont le triplet ; les
deux derniers, optionnels, attachent la provenance et les drapeaux **dans la même écriture** :

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | **sujet** du fait | — (requis) |
| `p` | **prédicat** (la relation) | — (requis) |
| `o` | **objet** (la valeur) | — (requis) |
| `source?` | l'origine du fait — voir la table `FactSource` ci-dessous | `undefined` = aucune source enregistrée (le fait existe mais n'a ni fraîcheur ni canal de revérification) |
| `flags?` | drapeaux posés **atomiquement** avec le fait (`{ closed?, major?, secret?, group?, companionOf?, cascade? }`) — voir [Les drapeaux](#les-drapeaux-statut-epistemique-et-saillance) | `undefined` = ouvert + mineur |

L'objet **`source`** (`FactSource`) :

| Champ | Rôle | Défaut |
|---|---|---|
| `kind` | type d'origine — l'une des valeurs listées ci-dessous | — (requis si `source` est fourni) |
| `ref?` | référence : URL, id de document, **nom d'outil**… (c'est ce que `FactVerifier` relit pour retrouver le bon canal) | `undefined` |
| `at?` | horodatage epoch ms de l'enregistrement | `undefined` → l'instant courant à l'écriture |
| `confidence?` | confiance portée par cette source, de `0` à `1` | `undefined` |
| `display?` | forme d'**affichage verbatim** de l'objet (casse/accents préservés) — le KB normalise `o` en minuscules pour la recherche ; ce champ garde l'original pour l'UI, lu via `displayOf()` | `undefined` → l'objet normalisé est affiché |

Les `kind` disponibles : `user` (affirmé par l'utilisateur), `document` (extrait d'un document
ingéré), `web`, `tool`, `llm-verified` (hypothèse LLM vérifiée puis mémorisée), `inference`
(dérivé par raisonnement), `import`.

> 💡 `tell` est **asynchrone** (`await`) et retourne `ContradictionReport | null` : `null` dans le
> cas normal, sinon un rapport quand le fait entrant a son **opposé exact** déjà en base
> (`p` ↔ `not_p`, même sujet, même objet). Les deux faits restent stockés — la mémoire archive
> l'évidence, le curateur tranche.

**`sourcesOf(s, p, o)`** prend le triplet exact et retourne **un tableau** `FactSource[]` (copie, en
ordre chronologique d'enregistrement) — vide `[]` si le fait n'a aucune source connue. C'est la même
forme que celle passée à `tell`, augmentée du `at` réel.

Redire un fait n'écrase rien : **les sources s'accumulent** — un fait confirmé par trois canaux
porte trois sources. Et toute la chaîne d'écriture de QPath source déjà ses faits automatiquement :
le PingPong marque `llm-verified`, les outils marquent `tool` + leur nom, les agents de recherche
marquent `web` + l'URL.

## La fraîcheur : un fait peut périmer

Une **politique de fraîcheur** donne une durée de vie aux faits selon leur origine — le web périme
vite, un document est stable — avec un réglage fin par prédicat (« vaut » est volatil, « est né en »
est éternel) :

```ts
kb.statusOf('bitcoin', 'vaut', '60000');   // 'fresh' → puis, 31 jours plus tard : 'stale'
kb.staleFacts();                            // tous les faits à revérifier
```

**`statusOf(s, p, o, policy?, now?)`** — dérive le statut de fraîcheur d'**un** fait à partir de sa
source la plus récente :

| Argument | Rôle | Défaut |
|---|---|---|
| `s`, `p`, `o` | le triplet à évaluer | — (requis) |
| `policy?` | la politique de fraîcheur — `{ ttlByKind?, ttlByPredicate? }` : TTL en ms par `kind` (absent = stable), avec override par prédicat | `DEFAULT_FRESHNESS` (web 30 j, tool 7 j, llm-verified 90 j ; le reste stable) |
| `now?` | instant de référence epoch ms (pour tester ou rejouer une date) | `Date.now()` |

Retourne `'fresh' \| 'stale' \| 'unknown'` : `'unknown'` si le fait n'existe pas ou n'a **aucune
source** (pré-provenance) ; `'fresh'` s'il est dans son TTL (ou si aucun TTL ne s'applique →
stable) ; `'stale'` si le TTL est dépassé.

**`staleFacts(policy?, now?)`** — mêmes deux arguments optionnels (mêmes défauts) ; retourne **tous**
les faits périmés sous forme d'un tableau `{ s, p, o, sources }[]`. Les faits **fermés** (🔒) sont
exclus : un fait décidé n'est plus jamais revérifié.

Un fait `stale` n'est pas supprimé — il est **candidat à la revérification**.

## La revérification : la mémoire suit le monde

Le `FactVerifier` revérifie un fait **par le canal indiqué par sa source** : un fait venu d'un
outil rappelle le même outil ; pour les autres origines, on branche ses propres canaux (re-recherche
web, re-vérification par LLM, re-demande à l'utilisateur) :

```ts
import { FactVerifier } from '@damba/libxn';

const verifier = new FactVerifier(kb, {
  tools,                                              // canal intégré : kind 'tool'
  reverifiers: {
    web: async (s, p) => await maRecherche(s, p),     // canal injecté : kind 'web'
  },
});

await verifier.verify('meteo paris', 'est', 'pluie');
// → { verdict: 'confirmed' }    : le fait tient, sa fraîcheur est ré-estampillée
// → { verdict: 'contradicted', current: ['soleil'] } : la réalité a changé —
//     l'ancien fait est archivé, le nouveau est mémorisé avec sa source
// → { verdict: 'unknown' }      : canal indisponible → on ne touche à rien

await verifier.sweep();   // mode « curateur » : balaye et revérifie tous les faits périmés
```

**Le constructeur `new FactVerifier(kb, opts?)`** :

- **`kb`** — la `KnowledgeBase` à revérifier (requis). C'est elle qui sera ré-estampillée
  (`confirm`) ou corrigée (`retract` + `tell`) selon le verdict.
- **`opts?`** — les canaux et réglages (objet, par défaut `{}`) :

| Option | Rôle | Défaut |
|---|---|---|
| `tools` | un `ToolRegistry` : canal **intégré** pour les faits de `kind: 'tool'` — rappelle l'outil d'origine (par nom via `ref`, sinon par prédicat) | `undefined` (pas de canal outil) |
| `reverifiers` | canaux **injectés** par `kind` de source (`{ web, 'llm-verified', user, … }`), chacun une fonction `Reverifier`. **Prioritaires** sur le canal `tools` | `undefined` (aucun canal injecté) |
| `policy` | politique de fraîcheur utilisée par `sweep` pour collecter les périmés | `DEFAULT_FRESHNESS` |
| `writeBack` | `false` = **dry-run** : calcule les verdicts sans toucher la KB | `true` (les verdicts écrivent) |

Un **`Reverifier`** est une fonction `(s, p, o, source) => Promise<string[] | null>` : elle renvoie
les valeurs **actuelles** observées pour `(s, p)`, ou **`null`** si le canal ne peut pas répondre
(indisponible, hors sujet) — ce `null` est ce qui produit le verdict `unknown`.

**`verify(s, p, o)`** prend le triplet exact d'un fait connu et retourne `Promise<VerifyOutcome>` :
`{ s, p, o, verdict, current?, via? }` où `verdict` est `'confirmed' | 'contradicted' | 'unknown'`,
`current` les valeurs observées (présent surtout en cas de contradiction) et `via` le canal utilisé
(`'tool:<ref>'` ou `'reverifier:<kind>'`).

> 🔒 `verify` **ne touche jamais** un fait secret (🔑) ni un fait fermé (🔒) : il renvoie d'emblée
> `unknown`. Pour un secret, l'objet stocké est un chiffré — le comparer à une valeur en clair
> donnerait toujours « contredit » et réécrirait le secret en clair (fuite). Un fait fermé est une
> décision figée, hors du champ de la revérification automatique.

**`sweep(now?)`** — `now` (epoch ms, défaut `Date.now()`) fixe l'instant d'évaluation de la
fraîcheur. Retourne un `Promise<SweepReport>` : `{ checked, confirmed, contradicted, unknown, outcomes }`
(les compteurs + le détail de chaque `VerifyOutcome`).

Un canal qui échoue donne `unknown`, jamais `contradicted` : **l'indisponibilité n'est pas une
contradiction**.

## L'archivage temporel : rien ne se perd

Quand un fait est contredit (ou rétracté manuellement via `kb.retract`), il cesse d'être servi —
mais il n'est **jamais effacé**. Il part dans l'historique avec sa **période de validité** :

```ts
kb.historyOf('marcella');
// → [{ s: 'marcella', p: 'travaille_chez', o: 'acme',
//      from: 1717000000000, to: 1760000000000, reason: 'contredit par revérification' }]
```

**`historyOf(s?, p?)`** — les deux arguments sont des **filtres optionnels** :

- **`s?`** — ne garder que les faits archivés de ce sujet ; `undefined` = tous les sujets.
- **`p?`** — ne garder que ce prédicat ; `undefined` = tous les prédicats.

Retourne un tableau `ArchivedFact[]` (le plus récent en dernier), chaque entrée portant la
**période de validité** : `{ s, p, o, sources, from?, to, reason? }` — `from` = premier
enregistrement connu (epoch ms, `undefined` si inconnu), `to` = instant de rétractation, `reason` =
pourquoi (contradiction, expiration, édition, manuel…).

**`kb.retract(s, p, o, reason?, now?)`** est ce qui alimente cet historique : `reason` (texte libre,
optionnel) et `now` (epoch ms, défaut `Date.now()`, qui devient le `to` de l'archive) ; il retourne
`true` si le fait existait, `false` sinon. Le fait cesse d'être servi **mais n'est jamais effacé**.

« Marcella travaille chez Acme » devient « **vrai de juin 2024 à juin 2026** ». La mémoire connaît
l'histoire de ses propres faits — précieux partout où l'historisation compte (santé, juridique,
finance, conformité). Et cet historique est **restituable** : adossé à un stockage durable, il
**survit au redémarrage** (voir [Persistance](/persistence)), donc les réponses « à l'époque c'était
X » restent disponibles après un redémarrage.

### Interroger le passé : `factAsOf` / `valueAsOf`

Éditer une valeur (`kb.editFact(s, p, oldO, newO)`) **archive l'ancienne** (avec sa période) et écrit la
nouvelle — donc chaque version successive est conservée. On interroge alors n'importe quel **instant** :

```ts
kb.valueAsOf('paris', 'maire', tEn2020);      // → ['x']  (ce qui était vrai à cette date)
kb.ask('paris', 'maire');                      // → ['y']  (la vérité actuelle)

kb.factAsOf('paris', 'maire', tEn2020);
// → { asOf: ['x'], current: ['y'], changed: true }
```

**`editFact(s, p, oldO, newO, source?)`** — modifie la valeur d'un fait :

| Argument | Rôle | Défaut |
|---|---|---|
| `s`, `p` | le sujet et le prédicat visés | — (requis) |
| `oldO` | l'**ancienne** valeur (celle à archiver) | — (requis) |
| `newO` | la **nouvelle** valeur (celle à écrire) | — (requis) |
| `source?` | provenance de la nouvelle écriture | `{ kind: 'user', ref: 'edit' }` |

Asynchrone, retourne `Promise<boolean>` : `true` si l'édition a réussi (ou si `oldO === newO`, un
no-op réussi) ; `false` si l'ancien fait n'existait pas. Sous le capot c'est un `retract(oldO)` suivi
d'un `tell(newO)` — l'ancienne valeur part donc à l'historique **avec sa période**, ce qui rend
chaque version successive interrogeable par les méthodes ci-dessous.

**`valueAsOf(s, p, at)`** et **`factAsOf(s, p, at)`** prennent le sujet, le prédicat et **`at`**,
l'instant à interroger (epoch ms) — les trois sont requis.

- **`valueAsOf`** retourne un **tableau** `string[]` : les valeurs valides à `at`. Il combine le
  **courant** (s'il était déjà vrai à `at`) et l'**archive** (faits dont la période `[from, to)`
  contient `at`).
- **`factAsOf`** retourne un **objet** `{ asOf, current, changed }` : `asOf` = le résultat de
  `valueAsOf` (ce qui était vrai à `at`), `current` = la valeur **actuelle** (`ask`), `changed` =
  `true` si les deux diffèrent — de quoi répondre « à l'époque c'était **X** (mais aujourd'hui c'est
  **Y**) » sans jamais réécrire l'histoire.

> **Les secrets restent masqués dans le temps.** `valueAsOf`/`factAsOf` et `historyOf` **excluent les
> faits secrets** par défaut (un fait rétracté conserve son drapeau `secret` dans l'archive) : une
> interrogation du passé ne contourne jamais le masquage du Coffre.

## Les drapeaux : statut épistémique et saillance

Au-delà de la provenance, chaque fait porte deux axes ORTHOGONAUX, posés par l'humain
(jamais automatiques) — tout fait naît *ouvert + mineur* :

| Drapeau | Sens | Effets mécaniques |
|---------|------|-------------------|
| **⭐ majeur** | fait STRUCTURANT (saillance) | garanti dans la fenêtre de contexte des réponses · prioritaire dans les alertes proactives et la migration |
| **🔒 fermé** | fait DÉCIDÉ (statut épistémique) | sort du circuit de revérification · plancher de confiance dans les chaînes de raisonnement · **gagne par défaut** face à une contestation (enregistrée et tracée, mais la décision ne se renverse qu'en rouvrant le fait) |
| **🔑 secret** | fait CONFIDENTIEL | masqué des lectures normales (`allFacts`, RAG, vue admin) ; valeur chiffrée ; accessible seulement par accès authentifié — voir [Couche d'accès](access-layer) |

Un fait peut être enregistré **avec ses drapeaux en une seule écriture** (atomique). C'est essentiel
pour un fait secret persisté : la valeur n'est jamais stockée durablement **sans** son marquage
`secret` — pas de fenêtre où le chiffré serait visible.

L'état par défaut d'un fait est **ouvert** (révisable) et **mineur** (périphérique) ; major,
fermé et secret sont des décisions explicites. Fermer un fait est un **acte de curation** :
c'est ce qui distingue une mémoire d'équipe (les décisions tiennent) d'un tableau blanc que
chacun peut raturer.

## Lier les faits et les règles

Un fait n'est pas toujours saisi à la main : il peut être **dérivé** par une règle. Quand le
moteur applique `X parent_de Y ; Y parent_de Z => X grand_parent_de Z`, le fait produit
`(alice, grand_parent_de, carl)` est écrit avec une **source d'inférence** qui pointe vers sa
règle :

```
source: { kind: 'inference', ref: 'rule:grand-parent' }
```

Ce lien rend la chaîne d'inférence **navigable dans les deux sens** :

- **du fait vers sa règle** : la provenance du fait dérivé nomme la règle qui l'a produit ;
- **de la règle vers ses faits** : on retrouve tous les faits dérivés en filtrant sur la
  source `rule:<nom>`.

Le même principe vaut pour les autres dérivations — la **généralisation de relations**
(« mère_de » dérive « parent_de », source `taxonomy:mère_de`) et les **règles induites**
(origine `induced`). Un fait sait donc toujours *pourquoi* il existe : saisi, importé, déduit
par telle règle, généralisé depuis telle relation. Connaissance et raisonnement restent
tissés ensemble, et auditables.

## Pourquoi c'est différent

| Problème | Réponse QPath |
| --- | --- |
| « D'où sort cette réponse ? » | Chaque fait remonte à sa source (qui, quand, quelle référence) |
| « C'était vrai l'an dernier… » | Fraîcheur par origine + revérification par le canal d'origine |
| « Le modèle a oublié / écrasé » | Rien n'est effacé : archivage temporel, période de validité |
| « Qui a le droit d'écrire ? » | Audit par source : purger/relire tout ce qui vient d'un canal |

> Les mécanismes internes (représentation, indexation) ne sont pas publiés — accès sur demande.
