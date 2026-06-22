# Routage d'intention sémantique

Avant de répondre, il faut savoir **ce que veut** un message : enregistrer un fait, poser une question,
ajouter un rappel, envoyer un courriel, consulter un solde… `@damba/libxn-intent` déduit cette
**intention** rapidement, **sans mots-clés de domaine** et sans modèle lourd. Il sert d'aiguilleur : il
oriente le message vers la bonne capacité, ou s'efface quand il n'est pas sûr.

> 💡 **Pas de liste de mots magiques.** Un routeur « si le texte contient *solde* alors… » est fragile :
> il rate « combien j'ai sur mon compte » et se trompe sur « balance un courriel ». Ici, on compare la
> **forme** d'un message à des exemples, pas des mots précis.

## Le principe : la forme, pas les mots

Le contextualiseur range chaque intention par quelques **exemples**, puis compare un nouveau message à
ces exemples selon deux signaux :

- les **mots-outils** (déterminants, prépositions, interrogatifs, pronoms : « quel », « à », « mon »,
  « est-ce que »…) qui portent la **structure** d'une demande, indépendamment du sujet ;
- la **similarité de trigrammes** de caractères, robuste aux fautes et aux variantes.

Le plus proche voisin pondéré l'emporte, et la décision est **filtrée par la confiance** : si le meilleur
score est trop bas ou trop proche du second, le routeur répond `unknown` plutôt que de deviner. C'est
QPath-natif, déterministe, zéro dépendance externe.

## Router un message

```ts
import { SemanticContextualizer, DEFAULT_INTENTS } from '@damba/libxn-intent';

const router = new SemanticContextualizer();          // jeu d'intentions par défaut

const r = await router.route('combien j\'ai sur mon compte ?');
//  → { intent: 'wallet', confidence: 0.71, via: 'qpath', alternatives: [...] }

const r2 = router.routeOffline('balance un courriel à Sophie');
//  → { intent: 'send_email', via: 'qpath' }   (jamais classé « wallet » malgré le mot « balance »)
```

- **`route(text)` → `Promise<RouteResult>`** — classe le message ; consulte le port LLM **seulement** si
  c'est ambigu (voir plus bas).
- **`routeOffline(text)` → `RouteResult`** — version 100 % déterministe (aucun appel externe).
- **`RouteResult`** = `{ intent, confidence, via: 'qpath' | 'llm' | 'unknown', alternatives }`.

Le jeu d'intentions est une simple liste `{ name, examples[] }`. Le défaut couvre chitchat, identité,
écriture/lecture de faits, raisonnement oui/non, transformations, courriel, notes, agenda, recherche web,
porte-monnaie. On le remplace ou on l'étend à la création :

```ts
import { type Intent } from '@damba/libxn-intent';

const intents: Intent[] = [
  ...DEFAULT_INTENTS,
  { name: 'book_room', examples: ['réserve une salle pour demain', 'je veux une salle à 14h'] },
];
const router = new SemanticContextualizer({ intents });
```

## Le LLM, en renfort et comme professeur

Le port `LlmIntentPort` est **optionnel** et n'intervient que sur l'**ambiguïté** (quand le déterministe
n'est pas confiant). Surtout, ce qu'il tranche est **appris** : le routeur ajoute l'exemple à l'intention
choisie (distillation), avec un poids prudent, et a donc de **moins en moins** besoin de lui.

```ts
const router = new SemanticContextualizer({
  llm: {
    async disambiguate(text, candidates) {
      // renvoie { intent, confidence } parmi `candidates`, ou null
      return { intent: 'send_email', confidence: 0.8 };
    },
  },
});

await router.route('fais passer un mot à Paul');   // ambigu -> LLM tranche, puis le routeur retient
router.learn('send_email', 'fais passer un mot à Paul');  // (apprentissage explicite possible aussi)
```

- **`disambiguate(text, candidates)`** — le seul point d'entrée LLM ; le port décide comment l'implémenter
  (proxy serveur, modèle local, règle…). Absent, le routeur reste **purement déterministe**.
- **`learn(intent, example)`** — ajoute un exemple à chaud, sans redémarrage.

## Réglage de la confiance

Le routeur est **prudent par défaut** : mieux vaut `unknown` qu'une mauvaise route.

| Option | Rôle | Défaut |
|---|---|---|
| `absThreshold` | score minimal pour être « confiant » | `0.4` |
| `marginThreshold` | écart minimal avec la 2ᵉ intention | `0.04` |
| `structWeight` | poids des mots-outils vs trigrammes | `0.45` |
| `provisionalWeight` | poids d'un exemple appris du LLM (< 1 = prudence) | `0.7` |

## À quoi ça sert

| Situation | Comment |
|---|---|
| Désambiguïser un déclencheur trop gourmand (« **balance** un courriel » ≠ solde) | laisser le handler matcher, puis **vérifier** l'intention et l'**annuler** si le routeur n'est pas d'accord (garde-fou) |
| Aiguiller vers la bonne capacité quand aucune règle déterministe ne tranche | `route()` au-dessus d'un seuil de confiance élevé |
| Couvrir des variantes/fautes sans lister des mots-clés | exemples par intention + similarité de forme |
| S'améliorer à l'usage | le LLM ne tranche que l'ambigu et **enseigne** le déterministe |

> 🔎 **Garde-fou plutôt qu'aiguilleur unique.** Le plus sûr est de garder la logique déterministe en
> première ligne et d'utiliser le routeur comme **second avis** : il confirme ou s'oppose, mais ne décide
> seul que lorsqu'il est franchement confiant.
