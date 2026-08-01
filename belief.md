# Croyance bayésienne — savoir à quel point on sait

La mémoire QPath stocke des **faits**. Mais tous les faits ne se valent pas : l'un a été confirmé dix
fois par des sources fiables, l'autre a été dit une fois, en passant. La **croyance bayésienne** attache
à chaque fait un **degré de confiance** qui évolue avec l'évidence — sans jamais toucher au fait
lui-même. Déterministe, **0 token**, auditable : chaque croyance peut expliquer d'où elle vient.

> 💡 **Le principe.** Chaque fait porte une croyance qui monte quand l'évidence le **confirme** et
> descend quand elle le **contredit**. Les sources n'ont pas toutes le même poids : une confirmation
> d'une source fiable pèse plus qu'une rumeur. Et un fait **verrouillé** par l'utilisateur garde un
> plancher de confiance : l'évidence contraire l'interroge, elle ne l'efface pas.

> 🎯 **Cas d'usage.** Deux informations se contredisent (« le bureau est à Lyon » / « le bureau est à
> Paris ») : la croyance départage par l'historique d'évidence, et la correction explicite de
> l'utilisateur fait autorité. Ou encore : « quelle est l'explication la plus probable ? » — la
> meilleure explication est choisie par le poids d'évidence, preuve à l'appui.

## Ce que la croyance ne fait jamais

Trois invariants, non négociables :

1. **Le bayésien ne décide jamais seul.** Il pondère, il éclaire, il départage à la marge — la décision
   d'écrire, de corriger ou de retirer un fait reste déterministe ou humaine.
2. **Un fait absent n'est pas un fait improbable.** Si la mémoire ne sait pas, la réponse est
   « je ne sais pas » — jamais « probablement pas ».
3. **La croyance ne modifie pas le fait.** Le triplet reste intact, avec sa provenance ; la croyance
   vit à côté, comme une annotation qui évolue.

## Comment l'évidence circule

Chaque événement pertinent devient une **évidence** : une vérification qui confirme, une contradiction
détectée, une correction de l'utilisateur (« non, je voulais dire… »), une prédiction qui s'est révélée
juste ou fausse après coup. La croyance se met à jour de façon **incrémentale et rejouable** : le même
historique d'évidences produit toujours la même croyance.

Les faits marqués par l'utilisateur gardent des **planchers** : un fait 🔒 verrouillé ne descend jamais
sous un seuil élevé, un fait ⭐ structurant garde un socle solide. L'autorité humaine prime sur
l'accumulation statistique.

## La meilleure explication

Quand plusieurs hypothèses expliquent une même observation, le moteur choisit celle que l'évidence
soutient le mieux — et **montre son raisonnement** : quelles évidences, quels poids, quelle marge sur
la deuxième hypothèse. C'est un choix éclairé et traçable, pas un verdict opaque.

## En pratique

```ts
import { BeliefEngine } from '@damba/libxn';

const belief = new BeliefEngine(kb);
belief.update('bureau', 'est_à', 'paris', { kind: 'confirm', source: { kind: 'user' } });
belief.update('bureau', 'est_à', 'lyon', { kind: 'contradict', source: { kind: 'document' } });

const b = belief.beliefOf('bureau', 'est_à', 'paris');
// b.mean : confiance actuelle · b.strength : poids d'évidence accumulé
belief.askWithBelief('bureau', 'est_à'); // les objets, classés par croyance
```

La croyance complète la [provenance](/fact-provenance) (d'où vient le fait) et la
[maintenance](/fact-maintenance) (le fait est-il encore frais) : ensemble, elles répondent à « que
sait-on, depuis quand, et à quel point ».
