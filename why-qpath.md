# Pourquoi QPath

## Le problème : un LLM seul ne suffit pas

Les grands modèles de langage sont remarquables pour **comprendre et produire du langage**. Mais utilisés
seuls, ils souffrent de quatre faiblesses **structurelles** — pas des bugs, des limites de nature :

- **Hallucination** — ils inventent des faits plausibles mais faux, sans le savoir.
- **Oubli** — ils n'ont pas de mémoire persistante : ce qui n'est pas dans le contexte est perdu.
- **Coût** — chaque réponse consomme des tokens ; re-fournir le contexte se paie à chaque tour.
- **Opacité** — on ne peut pas expliquer *pourquoi* une réponse est sortie. Boîte noire.

Dans une démo, ces limites passent. En production — santé, finance, juridique, agents autonomes — elles
deviennent rédhibitoires.

## QPath comble exactement ces manques

QPath est une **mémoire symbolique** : une structure qui stocke des faits et raisonne de façon
**déterministe**, à **0 token**. Ses propriétés répondent point par point aux faiblesses du LLM :

| Faiblesse du LLM | Réponse de QPath |
|------------------|------------------|
| Hallucination | **Déterminisme** — mêmes faits → mêmes réponses, jamais inventées |
| Oubli | **Mémoire persistante** — auditable, éditable, qui s'accumule |
| Coût (tokens) | **0 token** — récupération et raisonnement instantanés, gratuits |
| Opacité | **Traçabilité** — chaque conclusion vient avec son chemin de raisonnement |

## QPath + LLM : la vraie complémentarité

Le point clé : **les forces de l'un sont les faiblesses de l'autre.** Les opposer est une erreur ; les
combiner est la bonne architecture.

- **Le LLM apporte** : la fluidité du langage, la généralisation, la compréhension du flou, le
  raisonnement ouvert.
- **QPath apporte** : la mémoire, la vérité vérifiable, le déterminisme, la traçabilité, le coût nul.

Ensemble : **QPath décide et mémorise, le LLM verbalise.** Le LLM ne s'appuie plus sur ses souvenirs
flous mais sur une mémoire vérifiable — il ne peut plus halluciner ce que QPath sait. Et ce que QPath ne
sait pas encore, le LLM peut le raisonner, puis on le **ré-injecte dans QPath** : la connaissance grandit
au lieu d'être re-payée. *(Voir [Flash reasoning](flash-reasoning).)*

> En une phrase : **le LLM rend QPath éloquent ; QPath rend le LLM fiable.**

## La géométrie des clés préserve la structure

Une table de hachage **détruit** la structure des clés : le hash les disperse, donc elle ne sait faire
qu'un **lookup exact**. QPath, lui, encode chaque clé en **chemin** (paires de bits → directions). Deux
clés qui partagent un préfixe d'octets — `alice`/`alicia`, ou un identifiant scopé `user:42:…` — partagent
alors un **préfixe de chemin**. Parce que cette **même** représentation de chemin sert partout dans le
système, on obtient « gratuitement » des capacités de **recall flou** qu'un hash n'a pas nativement :

- **Voisins les plus proches** — les clés au plus long préfixe partagé, du plus proche au moins proche,
  **sans balayer** tout le jeu (coût quasi plat quand le nombre de clés grandit). Utile pour la résolution
  approchée : variantes, fautes de frappe, clés scopées.
- **Requête de préfixe** — toutes les clés sous un préfixe donné (requête de plage).
- **Similarité par position** — tolère une différence **au milieu** de la clé (`alice` vs `alike`), en
  réutilisant la même représentation de chemin que la recherche exacte.
- **Déduplication / blocking sans modèle** — regrouper les clés par préfixe de chemin forme des « blocs »
  de quasi-candidats. Pour trouver les quasi-doublons d'un jeu de données, on ne compare plus toutes les
  paires (coût qui explose quadratiquement) mais seulement **à l'intérieur de chaque bloc** — un coût
  quasi linéaire, **sans entraînement ni embeddings**. C'est une notion d'« à peu près pareil » qu'un
  hash classique n'a pas : il ne sait faire qu'un lookup exact.
- **Analogie structurelle** — la géométrie ne fait pas que *stocker* la structure, elle la **transforme**.
  En capturant la transformation d'une clé `A → B` (préfixe commun, milieu qui change, suffixe commun) puis
  en la rejouant sur une clé `C`, on répond à « A:B :: C:? » de façon **déterministe et sans modèle** :
  `user:42:profile : user:42:prefs :: user:99:profile → user:99:prefs`, ou `v1/users : v2/users ::
  v1/orders → v2/orders`. Limite assumée : c'est **structurel, pas sémantique** — « king:queen::man »
  n'a aucune structure partagée et ne donne rien.

Sur des clés scopées (`user:<id>:<champ>`), comparée au balayage d'une table classique, la recherche par
préfixe mesure une accélération qui **croît avec la taille** : ~1,8× à 1 000 clés, ~7× à 10 000, ~292× à
100 000 — le coût d'une requête QPath reste à peu près plat là où le balayage croît linéairement. De même,
sur la déduplication par blocking, l'accélération face à la comparaison de toutes les paires **croît avec
la taille** (par ex. ~12× sur 20 000 enregistrements), tous les quasi-doublons étant retrouvés.

> Cadrage honnête : c'est l'avantage de **toute** structure qui préserve les chemins face à un hash, pas
> une impossibilité mathématique ailleurs. Ce qui en fait un atout cohérent, c'est l'usage **uniforme** de
> la même représentation de chemin QPath dans tout le système. La similarité par position, elle, balaie le
> jeu de clés (coût linéaire) : à réserver aux ensembles raisonnables, ou en second étage après un filtrage
> par préfixe. Et le blocking ne rapproche que les clés qui partagent le **début** du chemin : une variation
> tout au début passe dans un autre bloc (on combine alors plusieurs clés de blocking).

## Ce que QPath apporte, domaine par domaine

### Santé & sciences de la vie
**Besoin :** des recommandations **justifiables**, pas une boîte noire. **QPath :** chaque conclusion est
tracée (du symptôme à la suggestion), la mémoire patient est éditable et auditable, rien n'est inventé.

### Finance, assurance & banque
**Besoin :** décisions d'éligibilité et de risque **explicables** et reproductibles (régulateur).
**QPath :** raisonnement déterministe sur des règles claires, trace pour chaque décision, zéro dérive.

### Juridique & conformité
**Besoin :** montrer *pourquoi* une clause s'applique, citer la chaîne de règles. **QPath :** chaînage
explicite des faits et des règles ; la réponse est défendable, pas probabiliste.

### Support client & assistants métier
**Besoin :** des réponses cohérentes, à jour, sans réinventer à chaque conversation. **QPath :** mémoire
partagée et fiable ; le LLM verbalise, QPath garantit l'exactitude. Moins de tokens, plus de constance.

### Agents IA autonomes
**Besoin :** une mémoire entre les étapes, sans re-payer le contexte ni halluciner ses propres souvenirs.
**QPath :** l'agent écrit ses faits et les relit à 0 token ; sa mémoire est inspectable et corrigeable.

### Éducation & formation
**Besoin :** un tuteur qui suit réellement ce que l'apprenant maîtrise. **QPath :** modèle de
connaissance par élève, persistant et traçable ; le LLM s'adapte, QPath garde le fil.

### Edge, mobile & souveraineté
**Besoin :** de l'IA **offline**, sans envoyer de données sensibles au cloud. **QPath :** tourne en local
(navigateur, mobile, embarqué), sans dépendance ni appel réseau ; les données ne quittent pas l'appareil.

### Connaissance d'entreprise
**Besoin :** une couche de relations interrogeable sans déployer une base graphe lourde. **QPath :**
profils, catalogues, ontologies métier dans une structure légère, déterministe, éditable.

### Recherche & R&D
**Besoin :** raisonner sur des faits structurés, vérifier des hypothèses, garder une trace. **QPath :**
substrat unifié pour stocker, croiser et inférer — reproductible et inspectable.

## En résumé

L'IA générative a besoin d'un **socle de vérité**. QPath est ce socle : une mémoire et un raisonnement
**déterministes, traçables, à 0 token**, qui transforment un LLM brillant mais faillible en un système
**fiable, explicable et économe** — dans tous les domaines où l'erreur, le coût ou l'opacité comptent.

::: tip
Découvrez [comment les composants s'articulent](components) et le [pattern Flash reasoning](flash-reasoning)
qui combine QPath, recherche web et LLM.
:::
