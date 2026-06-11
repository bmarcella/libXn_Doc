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
finance, conformité).

## Pourquoi c'est différent

| Problème | Réponse QPath |
| --- | --- |
| « D'où sort cette réponse ? » | Chaque fait remonte à sa source (qui, quand, quelle référence) |
| « C'était vrai l'an dernier… » | Fraîcheur par origine + revérification par le canal d'origine |
| « Le modèle a oublié / écrasé » | Rien n'est effacé : archivage temporel, période de validité |
| « Qui a le droit d'écrire ? » | Audit par source : purger/relire tout ce qui vient d'un canal |

> Les mécanismes internes (représentation, indexation) ne sont pas publiés — accès sur demande.
