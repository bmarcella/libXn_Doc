# Déduction générative ancrée

QPath ne génère pas du contenu en *échantillonnant* un modèle, mais en **déduisant** à partir de ce
qu'il sait déjà. Le paquet `@damba/libxn-generative` ajoute une couche de **génération par
raisonnement** au-dessus de la mémoire : tout ce qui est produit est **ancré** dans des faits réels,
**tracé** (on sait *pourquoi* chaque pièce a été produite), et **déterministe** (même graine → même
sortie). Pur QPath : **0 token, aucune dépendance réseau** dans le cœur.

> 💡 **Le principe.** Le contenu n'est pas *inventé*, il est **déduit** des faits existants
> (recombinaison, analogie, héritage). Quand il manque un maillon (un synonyme, un lien d'héritage, un
> fait), le moteur va **chercher la pièce manquante** — au besoin via une source externe **injectée**
> (web…) — la **valide**, l'écrit **en quarantaine**, puis **reprend** la déduction. La promotion vers
> la mémoire de référence reste une **validation humaine**.

## Pourquoi « ancrée » et pas « générative » tout court

Une génération libre, au fil de l'eau, produit du plausible *non vérifiable*. La déduction générative
fait l'inverse :

- **Ancrage** — chaque élément émis est une **valeur réellement stockée** ou une conclusion **déduite**
  de faits réels. Pas d'invention.
- **Auditabilité** — chaque sortie porte sa **trace de déduction** : lecture directe, analogie,
  héritage, recombinaison, ou maillon comblé (et par quelle source).
- **Déterminisme** — un générateur de hasard **reproductible** (graine) rend toute génération rejouable
  à l'identique. Indispensable pour tester, comparer, certifier.
- **Sous contrainte** — la génération s'appuie sur la mémoire ; ce qui est **décidé** (🔒) ou
  **structurant** (⭐) pèse davantage.

C'est l'opposé d'une « boîte qui écrit » : c'est une **boîte qui déduit, et montre son raisonnement**.

## Les modes de génération

| Mode | Déduit… | Coût | Exemple |
| --- | --- | --- | --- |
| **Recombinaison** | de nouvelles suites de **valeurs réelles** le long des chemins appris | 0 | recompose à partir du contenu ingéré |
| **Analogie** | l'objet d'un fait par **transformation structurelle** (A:B :: C:?) | 0 | `main.ts → main.js` ⇒ `app.ts → app.js` |
| **Héritage** | un attribut **hérité d'une classe** (avec exceptions) | 0 | « Socrate est humain ; l'humain a la raison » ⇒ Socrate a la raison |
| **Complétion** | la **suite** d'une entrée partielle + des variantes | 0 | complète / décline une amorce |
| **Données synthétiques** | des lignes **plausibles** selon les distributions apprises | 0 | jeux de test respectant les proportions réelles |
| **Synonyme (à la demande)** | un **alias** d'un terme | 0 (local) ou externe | « ia » ≡ « intelligence artificielle » |

Tous les modes sont **0 token** tant qu'on déduit du connu. Seul le **comblement** d'un maillon
manquant peut solliciter une source externe — et uniquement si l'hôte en a branché une.

## Combler les maillons manquants — d'abord la mémoire, le web en dernier

Quand la déduction **cale** (aucune valeur pour `(sujet, prédicat)`, classe parente inconnue, synonyme
requis), le moteur ne court **pas** directement sur le web. Il cherche d'abord la pièce manquante, par
**déduction pure (0 token)**, dans **toute la connaissance qu'il peut atteindre**, du plus spécifique au
plus large :

1. la **conversation** et les **documents ingérés** ;
2. la mémoire **de l'utilisateur** ;
3. la mémoire **de l'organisation** ;
4. la **connaissance partagée / les packs**.

Lecture directe, héritage, analogie, résolution approchée et synonymes **traversent toutes ces couches**
avant tout appel externe. Ce n'est **que** si aucune de ces sources ne sait que le moteur sollicite une
**source externe injectée par l'hôte** (par exemple une recherche web). Le cœur ne sait rien de cette
source : elle entre par un **port**, jamais par une dépendance — le paquet reste portable et
déterministe.

Le candidat récupéré ne touche **jamais** la mémoire de référence directement :

1. il est **normalisé et validé** (mêmes règles que l'ingestion : pas de terme vide/incohérent) ;
2. il est **dédupliqué** contre ce qui est déjà connu ;
3. il est écrit **en quarantaine** (une sous-couche jetable), avec sa **provenance** et **jamais**
   marqué « décidé » (il reste révérifiable) ;
4. la génération s'en sert pour continuer ;
5. **un humain valide** ensuite : *promouvoir* (le fait rejoint la mémoire de référence) ou *rejeter*.

> 🔒 **Garde-fou.** Le nombre d'appels externes est **borné**, la mémoire de référence n'est enrichie
> que par une **décision humaine explicite**, et chaque fait comblé conserve l'URL/identifiant de sa
> source — auditável et purgeable.

## Exemples

**1. Analogie structurelle** — générer par transformation, à partir d'exemples connus :

```
main.ts  compile_en  main.js
util.ts  compile_en  util.js
```
`analogize("app.ts", "compile_en")` → **app.js** *(via analogie, confiance 1.00)*

**2. Héritage** — un attribut déduit de la classe (avec exceptions) :

```
socrate  est  humain
humain   a    raison
```
`inherit("socrate", "a")` → **raison** *(hérité de « humain », distance 1)*

**3. Données synthétiques** — des lignes plausibles, jamais inventées, selon les **proportions réelles** :

```
p1 ville paris · p2 ville paris · p3 ville lyon
```
`synthesize({ ville }, 5)` → 5 lignes où `ville ∈ {paris, lyon}` dans les mêmes proportions que la
mémoire — **reproductible** à graine fixe.

**4. Comblement ancré — la mémoire d'abord, le web en dernier** — `analogize("tokyo", "pays")` :

- si un **document ingéré** ou la mémoire **org/user** contient déjà « Tokyo → Japon » → réponse
  **directe, 0 token, sans web** ;
- sinon, le moteur interroge la source externe → candidat `tokyo pays japon` **mis en quarantaine**
  (provenance web, jamais « décidé ») → l'humain **promeut** (le fait rejoint la mémoire) ou **rejette**.

**5. Synonyme à la demande** — `resolveSynonym("ia")` → **intelligence_artificielle** (alias `same_as`) :
lu dans la mémoire s'il est connu, sinon comblé puis promu par un humain.

> Chaque sortie revient avec sa **trace** : `direct` / `approx` / `inherited` / `analogy` /
> `recombination` / `gap-filled` — on sait toujours *pourquoi* une pièce a été produite.

## Cas d'usage

| Situation | Ce que la déduction générative apporte |
|-----------|----------------------------------------|
| Décliner des variantes/squelettes cohérents à partir d'exemples (code, configs, libellés) | **analogie** structurelle, déterministe |
| Compléter une fiche/entité à partir d'entités semblables | **héritage** + **analogie** |
| Fabriquer des jeux de test/démo réalistes **sans inventer** | **données synthétiques** (distributions apprises) |
| Étendre la connaissance d'un sujet en s'appuyant d'abord sur les **documents** et la mémoire **org/user**, le web seulement si nécessaire | **comblement ancré** → quarantaine → promotion humaine |
| Réconcilier des termes (synonymes/alias) | `resolveSynonym` (`same_as`) |

> ❌ **Quand ne pas l'utiliser.** Pour de la **prose libre fluide**, ce n'est pas l'objectif (voir plus
> bas) : la force est le **structuré, le déductif et les données**.

## Déterminisme & reproductibilité

La marche générative s'appuie sur une source d'aléa **injectable** : sans graine, comportement habituel ;
avec une graine, la sortie est **identique à chaque exécution**. En mode hors-ligne (aucune source
externe branchée), une génération est donc **100 % reproductible** — ce qui en fait une brique testable
et certifiable, là où un échantillonnage classique ne l'est pas.

## Où ça s'inscrit

C'est le pendant **génératif** des [types de raisonnement](/reasoning-types) : les mêmes faits, la même
grille, mais cette fois pour **produire** du nouveau plutôt que seulement répondre. La génération suit
le même ordre que tout le pipeline : **déduction pure d'abord** (lecture directe → résolution
approchée → analogie → héritage), source externe **en tout dernier recours**, et tout reste **tracé**.

> La génération de prose fluide n'est volontairement **pas** l'objectif : la force de la déduction
> générative est le **structuré, le déductif et les données** — du nouveau qu'on peut **expliquer**.
