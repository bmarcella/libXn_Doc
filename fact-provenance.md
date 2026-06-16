# Provenance & revérification

Un fait n'est pas juste « vrai » : il vient de quelque part, à un moment donné — et **il peut être
vrai aujourd'hui et faux demain**. QPath attache donc à chaque fait sa **provenance** (qui, quand,
d'où), en dérive une **fraîcheur**, et sait **revérifier** un fait périmé par le canal même qui
l'avait produit.

> **Chaque fait sait d'où il vient. Sa source dit comment le revérifier. Et rien n'est jamais
> effacé : la mémoire devient temporelle.**

## La provenance : chaque fait a ses sources

`tell` accepte une source optionnelle — type d'origine (`kind`), référence (`ref` : URL, id de
document, nom d'outil…), horodatage, confiance :

```ts
await kb.tell('marcella', 'travaille_chez', 'damba', { kind: 'user' });
await kb.tell('bitcoin', 'vaut', '60000', { kind: 'web', ref: 'https://exemple.org/cours' });

kb.sourcesOf('bitcoin', 'vaut', '60000');
// → [{ kind: 'web', ref: 'https://exemple.org/cours', at: 1760000000000 }]
```

Les `kind` disponibles : `user` (affirmé par l'utilisateur), `document` (extrait d'un document
ingéré), `web`, `tool`, `llm-verified` (hypothèse LLM vérifiée puis mémorisée), `inference`
(dérivé par raisonnement), `import`.

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

`valueAsOf` combine le **courant** (s'il était déjà vrai à `at`) et l'**archive** (faits dont `[from, to)`
contient `at`). `factAsOf` ajoute la valeur **actuelle** et un drapeau `changed` — de quoi répondre
« à l'époque c'était **X** (mais aujourd'hui c'est **Y**) » sans jamais réécrire l'histoire.

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
