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
