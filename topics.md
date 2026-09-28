# Sujets de conversation

Dans une longue conversation, on saute d'un sujet à l'autre puis on y revient. `TopicSegmenter`
**regroupe les messages par sujet** — sans appel LLM, de façon **déterministe et rejouable** — pour
ne donner au modèle que le **contexte pertinent** (et pas tout l'historique bruyant).

> 💡 **Pourquoi.** Mélanger « les avions » et « les voitures » dans un même contexte dégrade les
> réponses. En isolant le sujet courant, on garde un contexte propre et on économise des tokens.

## Affecter les messages

```ts
import { TopicSegmenter } from '@damba/libxn';

const seg = new TopicSegmenter();

seg.assign('Parle-moi des avions', 1000);            // { isNew: true,  topic.label: 'avion' }
seg.assign("Vitesse de croisière d'un avion ?", 2000); // { isNew: false, même sujet }
seg.assign('Et les voitures électriques ?', 3000);   // { isNew: true,  nouveau sujet }
seg.assign("Combien de passagers dans un avion ?", 4000); // retrouve le sujet « avion »
```

- **`assign(text, now?)` → `TopicAssignment`** — range le message dans le sujet existant le plus proche
  (partage de vocabulaire) **ou** en crée un ; renvoie `{ topic, isNew }`. À égalité, **le sujet courant
  gagne** (pas de ping-pong).
- **`propose(text)` → `TopicProposal`** — version **pure** (ne modifie rien) : où irait ce message, et
  avec quelle confiance — utile pour arbitrer avant de valider.

## Lire, étiqueter, rejouer

```ts
seg.topics();                 // sujets actifs, plus récent d'abord
seg.active();                 // dernier sujet assigné
seg.setMeta(id, { label: 'Aéronautique', description: 'Tout sur les avions' });
seg.remove(id);               // l'hôte exclura alors ses messages du contexte LLM
```

- **`topics()` / `active()`** — la liste des `ConversationTopic` (`id`, `label`, `keywords`,
  `messageCount`…) et le sujet courant.
- **`setMeta(id, { label?, description? })`** — étiquette un sujet (survit au recalcul).
- **`replayAssign(text, knownTopicId?, now?)`** — au **rechargement**, rejoue les affectations en
  respectant les décisions déjà persistées : mêmes `id` (`t0`, `t1`…) → reproductible sans base de
  décisions.

## Cas d'usage

| Situation | Apport |
|---|---|
| Chat multi-sujets sans contamination | ne donner au LLM que le **sujet courant** |
| UI conversationnelle « par onglets » | afficher `topics()`, cliquer → changer de contexte |
| Reprendre une conversation après rechargement | `replayAssign` (ids stables, déterministe) |
| Arbitrage fin (sujet ambigu) | `propose()` puis `commitTo(text, topicId)` |

> ⚙️ **Zéro token.** Le découpage repose sur un score lexical (mots-clés pondérés, mots vides FR/EN),
> pas sur un LLM — instantané et **rejouable**.

## Clore un sujet

Un sujet se referme tout seul : la conversation part ailleurs et n'y revient plus. C'est ce moment
qu'il faut savoir nommer, parce que c'est le seul où l'on peut résumer sans couper la parole.

```ts
seg.isClosed(id);                                  // ce sujet est-il refroidi ?
seg.closedTopics();                                // les sujets clos, le plus FROID d'abord
seg.closedTopics({ gap: 5, minMessages: 3 });      // seuils réglables
```

- Un sujet est **clos** quand `gap` messages consécutifs au moins sont partis vers d'**autres**
  sujets, **et** qu'il compte au moins `minMessages` messages. Défauts : `{ gap: 3, minMessages: 2 }`.
- Les deux conditions comptent. Sans la première on clôt du **chaud** — le sujet dont on est en
  train de parler. Sans la seconde on clôt une question isolée, qui ne porte rien à retenir.
- **Rejouable** : le verdict se reconstruit par `replayAssign` dans l'ordre des messages, donc il est
  le même au rechargement. Rien de nouveau à persister.
- `isTopicClosed({ messageCount, lastIndex }, currentIndex, opts)` est la décision **pure**, hors de
  la classe : deux nombres suffisent à la tester.

## Factualiser un sujet clos

Un résumé est une chaîne : on ne l'interroge pas, on ne le rétracte pas, il ne dit pas d'où il vient.
`TopicFactualizer` transforme un sujet clos en **entité** et sa carte en **faits ordinaires** —
interrogeables, datés, rattachés à la phrase exacte dont ils viennent.

```ts
import { buildTopicFacts, factualiseTopic, topicSubject } from '@damba/libxn';

const facts = buildTopicFacts({
  projectId: 'p1', topicIndex: 2, label: 'bail de Laval',
  messages: [{ id: 'm1', text: '…', at: 1_700_000_000_000 }],
  summary: 'Le bail se termine en mars.',      // rédigé par un modèle ou par un humain
  decided: ['on renouvelle pour un an'],
  knownEntities: ['Marie Tremblay'],
});

await factualiseTopic(kb, companions, { /* même entrée */ });
```

La carte d'un fil, en prédicats réservés sur le sujet `topic:<projet>#<n>` : `is`
(`conversation_topic`), `label`, `summary`, `decided`, `open_question`, `mentions`, `from_message`,
`at`, `until`, et le témoin `factualised`.

- **Elle ne déduit rien.** `summary`, `decided` et `open_question` ne sont écrits que si l'appelant
  les fournit, et ils gardent l'origine `llm` : lisibles comme **non vérifiés**. Ce qui est
  calculable (label, bornes de temps, messages d'origine, entités citées) est calculé.
- **Elle ne cite que du connu.** `mentions` ne retient que les entités que la mémoire connaît déjà :
  inventer une entité depuis un mot du fil fabriquerait des sujets fantômes.
- **Elle ne lit aucun message secret**, et un segment sans message lisible ne crée aucune entité.
- **Elle ne s'exécute qu'une fois.** Le témoin `factualised` le garantit — sans lui, chaque passage
  ajouterait un résumé de plus.
- **Elle s'annule d'un geste.** Les faits sont des compagnons en cascade de
  `conversation:<projet>#<n>` : rétracter le propriétaire les emporte tous.
- **Jamais `closed`, jamais `major`.** Ce sont des énoncés produits sur un fil de discussion, pas des
  décisions humaines ni l'ossature de la mémoire.

> ⚠️ **Portée assumée.** Ce module écrit des faits **sur la conversation**, jamais **sur le monde**.
> Les affirmations du fil (« le loyer est 880 dollars ») passent par le pipeline d'écriture habituel,
> avec son aperçu et sa validation humaine.
