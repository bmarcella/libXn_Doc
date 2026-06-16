# Plot Reasoning

Un mode de raisonnement sur la **trame** (le *plot*) : les **événements**, leur **ordre** et leurs
**causes**. Là où la base de connaissances raisonne sur des faits intemporels (« le pingouin est un
oiseau »), le Plot Reasoning raisonne sur des faits **situés** :

```
négligence cause étincelle
étincelle cause incendie
incendie cause alarme
incendie cause évacuation
alarme précède évacuation
```

La trame d'un récit, d'un dossier d'enquête, d'un historique d'incidents — reconstruite depuis des
faits ordinaires, interrogeable en déterministe, **à 0 token**.

## Ce qu'il sait faire

| Question | Mécanisme | Exemple |
|----------|-----------|---------|
| « Qu'est-ce qui a mené à X ? » | remontée aux **causes racines** | `négligence —cause→ étincelle —cause→ incendie —cause→ évacuation` |
| « Quelles conséquences a eu X ? » | déroulé de la **clôture causale** | l'étincelle finit par provoquer incendie, alarme, évacuation |
| « Dans quel ordre ? » | **chronologie** (tri topologique ordre + causalité) | négligence → étincelle → incendie → alarme → évacuation |
| Trame suspecte | détection d'**incohérences** | une « cause » prouvée postérieure à son effet, ou un **cycle purement causal** (un effet qui re-cause sa propre cause), est signalé — une seule fois |
| « Qui ? Pourquoi ? » | acteurs et motifs déclarés des événements | `évacuation acteur gardien · motif sécurité` |

Chaque réponse porte sa **chaîne d'événements en preuve** — le « pourquoi » est auditable, comme
tout le reste de la mémoire.

## Les conventions

Tout est triplet ordinaire ; seuls les **prédicats** sont conventionnels (et configurables) :

- `cause` / `provoque` / `entraîne` / `déclenche` — arêtes causales ;
- `précède` / `avant` / `before` — arêtes d'ordre ;
- `acteur`, `motif` — qui agit, et pourquoi.

Un détail de sémantique qui compte : un événement qui cause **deux** choses n'affaiblit aucune des
deux — chaque arête causale affirmée est un fait plein (la confiance ne se dilue pas entre les
conséquences d'un même événement).

## D'où viennent les événements

Le raisonnement est 100 % déterministe ; **l'extraction** des événements depuis la prose, elle,
est le travail d'un extracteur (humain, ou LLM avec schéma événementiel). La provenance de chaque
arête dit toujours **qui a affirmé la causalité** — une cause *affirmée par un texte* n'est jamais
confondue avec une cause *prouvée*.

## Quand l'utiliser

| Situation | Mode conseillé |
|-----------|----------------|
| Propriétés, classes, attributs (« qui est quoi ») | déduction symbolique classique |
| Question décomposable en une passe | Flash reasoning |
| Raisonnement ouvert validé pas à pas | PingPong |
| **Récits, post-mortems, dossiers : « pourquoi », « qu'est-ce qui a mené à », « dans quel ordre »** | **Plot Reasoning** |
