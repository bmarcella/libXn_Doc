# Raisonnement Big Bang

**Big Bang** est un **mode de raisonnement** de QPath — aux côtés de ChainResolver, RuleEngine, PingPong
et Plot. Là où les autres **suivent une chaîne** ou **appliquent une règle**, Big Bang **raisonne par
analogie et par régularité** : il **cherche les similitudes** dans toute la grid, les **compile**, et
**déduit de nouveaux faits solides**. Déterministe, **0 token**, sans LLM.

## Le principe

Tu connais des faits sur beaucoup de sujets. Big Bang exploite ce que les sujets qui **se ressemblent**
ont en commun :

- **Analogie** — les sujets **similaires** (qui partagent des faits avec la cible) *votent* les
  propriétés que la cible n'a **pas encore**.
- **Régularité de classe** — si **presque tous** les membres d'une classe ont une propriété, la cible
  l'a **probablement** aussi.

## Exemple

> Socrate et Platon sont des hommes mortels. Aristote est un homme ⇒ **Aristote est probablement
> mortel.**

La déduction **émerge des similitudes** — personne ne l'a écrite explicitement.

## La solidité = corroboration

Chaque fait déduit porte :

- sa **confiance** — sa corroboration : plus de cas l'attestent, plus il est **solide** ;
- sa **provenance** — par **quoi / qui** il est soutenu.

Un trait porté par **un seul** voisin est **écarté** ; un trait partagé par **tous** est **retenu**.
Rien n'est asséné en aveugle — chaque déduction est **explicable**.

## À sa place parmi les modes

| Mode | Ce qu'il fait |
|---|---|
| **ChainResolver** | suit une **chaîne** connue (héritage, transitivité) |
| **RuleEngine** | **applique** une règle |
| **Plot** | relie **causes** et **ordre** d'événements |
| **Big Bang** | **découvre** par **ressemblance** — généralise du connu vers le probable |

Ensemble : **récupérer**, **chaîner**, **appliquer**, et désormais **généraliser** — sans jamais quitter
le déterminisme ni la traçabilité.
