# Benchmark public — les chiffres, reproductibles

QPath fait des promesses fortes : mémoire exacte, zéro hallucination, raisonnement à 0 token,
auditabilité totale. Un benchmark public les met à l'épreuve — **reproductible en une commande**,
données générées par script seedé, **zéro réseau pendant la mesure**, résultats datés et conservés.
Deux exécutions du même seed donnent les mêmes métriques, au bit près (c'est vérifié par un test).

> 🎯 **Ce qu'on mesure.** Les trois choses qu'une équipe qui construit un agent teste en premier :
> la mémoire tient-elle quand on **reformule** ? le raisonnement multi-saut tient-il **sans appeler
> un modèle payant** ? et peut-on **auditer puis rétracter** sans fuite ? On compare des
> comportements mesurables, jamais des architectures.

## Résultats (seed 42 · 2026-08-02)

Trois tailles de corpus : 1 000, 10 000 et 100 000 faits. Baseline tâche 1 : retrieval top-k
lexical (TF-IDF cosinus, seuil 0.35 publié) — le choix « zéro réseau » assumé : une baseline à
embeddings exigerait le téléchargement d'un modèle ; un port permet à qui veut de brancher la
sienne.

### Tâche 1 — rappel sur reformulation (+ questions pièges)

On stocke des faits, on interroge avec des **synonymes de verbes** et des **tournures
équivalentes** (« habite » / « vit à » / « réside »), plus des questions **pièges** sur des faits
jamais stockés.

| | 1 k faits | 10 k | 100 k |
|---|---|---|---|
| QPath — rappel exact | **100 %** | **100 %** | **100 %** |
| QPath — hallucination sur pièges | **0 %** | **0 %** | **0 %** |
| Baseline — rappel exact | 79 % | 86 % | 79 % |
| Baseline — hallucination sur pièges | 86 % | 80 % | 63 % |
| QPath — latence p50 | < 0.1 ms | < 0.1 ms | **< 0.1 ms (stable)** |
| Baseline — latence p50 | 0.16 ms | 1.32 ms | 21.75 ms |

Deux lignes racontent tout : sur les pièges, la baseline **répond quand même** (63-86 % du temps) ;
QPath dit « je ne sais pas ». Et la latence QPath **ne bouge pas** quand le corpus est multiplié
par 100.

### Tâche 2 — raisonnement multi-saut à 0 token

Chaînes d'héritage de 2 à 4 sauts (A est un B, B est un C, C a une propriété → A l'a aussi), avec
des **négations bloquantes** (l'exception qui interrompt l'héritage) et des pièges.

| | 1 k | 10 k | 100 k |
|---|---|---|---|
| Exactitude | **100 %** | **100 %** | **100 %** |
| Tokens LLM consommés | **0** | **0** | **0** |
| Latence p50 | 0.06 ms | 0.05 ms | 0.09 ms |

La baseline LLM (la même question posée à un modèle avec le corpus en contexte) se branche par un
port : sans clé API, elle est publiée « non exécutée » — jamais inventée. Le différentiel de coût
est structurel : 1 000 réponses QPath coûtent 0, quel que soit le volume.

### Tâche 3 — auditabilité et rétractation

Chaque réponse doit exhiber sa **provenance** (fait direct) ou sa **chaîne** (déduction). Puis on
rétracte des faits et on vérifie qu'ils ne sont **jamais** resservis — tout en sachant répondre
« à telle date, la réponse était X ».

| | 1 k | 10 k | 100 k |
|---|---|---|---|
| Réponses tracées | **100 %** | **100 %** | **100 %** |
| Fuites après 100 rétractations | **0** | **0** | **0** |
| Lectures temporelles exactes | **100 %** | **100 %** | **100 %** |

Cette tâche n'a pas de baseline : c'est le différenciateur. Un index vectoriel ne sait ni citer sa
source fait par fait, ni garantir qu'un souvenir retiré ne refera pas surface, ni rejouer l'état
d'hier.

## Reproduire

Le harnais est livré avec le paquet `@damba/libxn` :

```bash
npm run bench:public                    # 3 tailles, résultats datés (JSON + Markdown)
npm run bench:public -- --seed=7        # changez le seed : les données changent, les garanties non
```

Sortie : le tableau ci-dessus + un JSON brut (métriques, seed, versions, specs machine, durées).
Machine des chiffres publiés : Intel Core Ultra 9 185H, Node 22 — run complet en 7 s, ingestion des
100 000 faits en 2,3 s. Les cas où la baseline gagne sont publiés au même endroit que les autres.

Les résultats datés vivent avec le code et chaque nouvelle exécution s'ajoute sans écraser les
précédentes. Pour reproduire le benchmark sur votre machine dans le cadre d'une évaluation,
[contactez-nous](https://damba.io) : le harnais complet est fourni sous licence d'évaluation.
