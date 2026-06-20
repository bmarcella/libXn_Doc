# Performance & garanties

QPath fait des promesses fortes — **déterministe**, **à 0 token**, **fidèle à l'échelle**. Cette page
les **chiffre** : des propriétés *prouvées par des tests* et une performance *mesurée*, pas affirmée.

## Les garanties (prouvées par des tests)

- **Déterministe** — mêmes entrées → mêmes résultats, toujours. Aucune hallucination.
- **Adressable par contenu** — récupération exacte, sans index externe ; deux objets logiquement
  identiques mènent au même endroit.
- **Recall fidèle à l'échelle** — la bonne information est servie **même sur des dizaines de milliers
  de sujets** : aucun faux fait, aucune contamination entre sujets.
- **Persistance sans perte** — la mémoire se sérialise et se recharge à l'identique.

## Baseline mesurée

Mesure sur un seul thread Node, du millier à 50 000 faits :

| Faits | Ingestion | Débit | Lecture | Recall | Mémoire / fait |
|------:|----------:|------:|--------:|:------:|---------------:|
| 1 000  |  23 ms |  44 000/s | **0,9 µs** | **100 %** | 6,3 |
| 5 000  |  72 ms |  70 000/s | **1,0 µs** | **100 %** | 4,5 |
| 20 000 | 306 ms |  65 000/s | **1,6 µs** | **100 %** | 4,1 |
| 50 000 | 782 ms |  64 000/s | **2,0 µs** | **100 %** | 3,1 |

## Ce que ces chiffres signifient

- **Lecture en temps quasi constant** — ×50 de données ne fait passer la latence d'une question que
  d'environ 0,9 à 2 µs. Soit de l'ordre de **500 000 lectures par seconde** à 50 000 faits.
- **Recall 100 % à toute échelle** — y compris à 50 000 sujets. La fidélité ne se dégrade pas quand la
  mémoire grandit.
- **Ingestion linéaire** — ~65 000 faits/s, sans point de rupture jusqu'à 50 000.
- **Mémoire qui s'amortit** — le coût par fait **diminue** à mesure que le corpus grandit (de 6,3 à 3,1),
  car la structure partage ce qui est commun.

## En face d'un LLM seul

| | LLM seul | QPath |
|---|---|---|
| Lecture d'un fait | re-fournir le contexte, **tokens** | **~2 µs**, 0 token |
| Fiabilité | probabiliste (hallucination possible) | **déterministe**, recall mesuré 100 % |
| Mémoire | fenêtre de contexte, volatile | persistante, sans perte |
| Explication | boîte noire | trace lisible et auditable |

## Reproductible

Tout est vérifiable, livré avec le paquet :

```bash
npm test            # caractérisation : encodage, sérialisation, surface de raisonnement, recall
npm run bench       # capacités de raisonnement (recall 100 %)
npm run bench:scale # la baseline d'échelle ci-dessus
```

> Le fonctionnement interne de QPath (encodage, structure) n'est pas documenté publiquement.
> Ce sont les **garanties observables** et les **mesures** qui sont présentées ici.
