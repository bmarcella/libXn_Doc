# Outils (Tools)

Les **outils** étendent QPath au-delà de sa mémoire : un dev écrit une capacité (recherche web, calcul,
API, requête SQL…) que **QPath peut appeler pour combler un manque**. C'est l'équivalent du
« function-calling » des LLM, **mais ancré sur QPath** : ce que l'outil ramène devient des **faits
mémorisés, auditables et réutilisables à 0 token**.

> **QPath ne sait pas → il appelle un outil → l'outil renvoie des faits → QPath les mémorise.**

## Écrire un outil

Un outil est un objet qui implémente le port `Tool` : un nom, une description, et un `run`. Il renvoie
des **faits** (triplets) et/ou une **valeur** directe.

```ts
import { Tool, ToolResult } from '@damba/libxn';

const weather: Tool = {
  name: 'weather',
  description: 'Météo actuelle d\'une ville',
  resolves: ['weather_of'],                       // (optionnel) prédicat qu'il sait résoudre
  async run(input): Promise<ToolResult> {
    const city = String(input['subject'] ?? input['query']);
    const data = await fetchWeather(city);
    return {
      facts: [[city, 'weather_of', data.condition]],  // → mémorisé dans QPath
      value: data,                                // → réponse directe optionnelle
    };
  },
};
```

On enregistre les outils dans un **registre** :

```ts
import { ToolRegistry } from '@damba/libxn';
const tools = new ToolRegistry().register(weather);
```

## Deux façons de déclencher un outil

### 1. Déterministe (liaison de prédicat) — sans LLM

Si un outil déclare `resolves: ['weather_of']`, QPath l'appelle automatiquement quand il ignore `(s, weather_of)` :

```ts
import { resolveWithTools } from '@damba/libxn';

const r = await resolveWithTools(kb, tools, 'paris', 'weather_of');
// QPath ne savait pas → l'outil tourne → le fait est mémorisé → r.objects = ['rain']
// La prochaine fois, QPath répond seul : 0 token, 0 appel d'outil.
```

Reproductible, traçable, sans LLM.

### 2. Piloté par le LLM (coup TOOL dans PingPong)

En [PingPong reasoning](/pingpong-reasoning), le LLM peut jouer un coup `TOOL` ; l'outil tourne, ses faits
entrent dans QPath, et l'échange continue — ancré.

```ts
import { PingPongReasoner } from '@damba/libxn';

const result = await new PingPongReasoner(kb, llm, { tools }).run('Quel temps fait-il à Paris ?');
// Le LLM joue : TOOL weather | city=paris  → QPath mémorise (paris, weather_of, rain) → CONCLUDE
result.factsLearned;   // [{ s: 'paris', p: 'weather_of', o: 'rain' }]
```

## Réponses dynamiques (volatiles)

Certaines réponses ne doivent **pas** être mémorisées : météo, cours de bourse, heure, statut serveur…
Les écrire dans QPath créerait des **faits périmés**. Marque alors l'outil (ou un appel précis) comme
**volatile** (`ephemeral`) : QPath **utilise** la réponse pour ce tour, mais ne la **mémorise pas** — et
rappelle donc l'outil la prochaine fois (valeur fraîche).

```ts
const weather: Tool = {
  name: 'weather',
  description: 'Météo actuelle',
  resolves: ['weather_of'],
  ephemeral: true,                         // ← jamais mémorisé (donnée dynamique)
  async run(input) {
    const city = String(input['subject'] ?? input['query']);
    return { facts: [[city, 'weather_of', await currentWeather(city)]] };
  },
};
```

- **Au niveau de l'outil** : `ephemeral: true` → toutes ses réponses sont volatiles.
- **Par appel** : `return { facts: [...], ephemeral: true }` → l'emporte sur le défaut de l'outil
  (utile pour un outil parfois stable, parfois volatile).

À l'inverse, un fait **stable** (capitale d'un pays, relation métier…) est mémorisé normalement et
réutilisé à 0 token.

## Pourquoi c'est utile

- **La mémoire grandit** — un fait ramené par un outil est mémorisé : on ne le re-cherche pas deux fois.
- **Ancrage** — les résultats deviennent des faits QPath, donc **auditables** (pas une réponse opaque).
- **Découplé** — l'outil est un **port** : le noyau ne dépend d'aucune API. Le dev branche ce qu'il veut
  (web, calcul, base interne…) sans toucher à QPath.

## Idées d'outils

| Outil | Apporte à QPath |
|-------|-----------------|
| Recherche web (Tavily, Brave…) | faits frais du web |
| Calculatrice / unités | résultats numériques exacts |
| Base de données interne | faits métier à jour |
| API tierce (météo, géo, finance…) | données en temps réel |
| Lecteur de documents | faits extraits de PDF/notes |

::: tip
Le fonctionnement interne de QPath n'est pas documenté publiquement. Pour un accès technique ou un
partenariat, contactez l'auteur. Voir aussi [PingPong reasoning](/pingpong-reasoning) et
[Composants clés](/components).
:::
