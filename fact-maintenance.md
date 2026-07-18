# Hygiène des faits — Garbage Collector & FactAdjuster

À grande échelle (un livre, des milliers de messages), l'extraction produit parfois des faits
imparfaits : un pronom non résolu, du texte corrompu, un fragment sans valeur. QPath se **maintient
tout seul**, en arrière-plan, avec deux mécanismes complémentaires et **toujours réversibles**.

> **Principe partagé.** Rien n'est jamais supprimé définitivement : la rétractation est une **archive
> temporelle** (le fait reste consultable dans l'historique et restaurable). Les faits **décidés par
> un humain** (verrouillés / actés) ne sont **jamais** touchés. Les faits **secrets** (coffre) sont
> ignorés. Tout est **langue-agnostique** (le vocabulaire vient d'un pack de langue injectable).

> 🎯 **Cas d'usage.** Après avoir ingéré un livre entier, la mémoire contient quelques scories : un pronom
> non résolu (« il habite Paris » sans savoir qui), un fragment corrompu, un fait sans valeur. QPath
> **répare ce qui est récupérable** et **écarte le reste**, en arrière-plan, **sans jamais rien perdre
> définitivement** (tout est archivé, réversible). Le problème résolu : garder une mémoire propre à grande
> échelle sans nettoyage manuel ni risque de suppression irréversible.

## FactAdjuster — réparer ce qui est récupérable

Le FactAdjuster **relit le contexte source** d'un fait (le tour de conversation ou le passage du
document dont il provient) pour **corriger** un enregistrement imparfait.

Cas typique : un **sujet-pronom non résolu**. « Il aime le café » a pu être enregistré tel quel faute
de contexte au moment de l'extraction. En relisant la source, l'Ajuster retrouve l'antécédent et
corrige le sujet.

> **Prudence avant tout.** « Il » ne veut **pas** dire « Jean » par défaut. L'Ajuster corrige le sujet
> **uniquement s'il peut le DÉDUIRE sans ambiguïté** — soit parce qu'un fait de **même prédicat et
> objet** désigne un **sujet unique**, soit parce que le contexte ne contient **qu'un seul sujet**. Dès
> qu'**plusieurs** antécédents sont possibles, il **ne touche à rien** — mieux vaut un fait à préciser
> qu'une correction fausse.

## Garbage Collector — effacer ce qui n'a aucun sens

Le ramasse-miettes retire **uniquement** les faits **incompréhensibles, malformés ou sans aucun sens**
— pour un humain, pour le LLM comme pour QPath. Volontairement **conservateur** : au moindre doute, il
ne touche pas.

Ce qu'il vise :

- un sujet, prédicat ou objet **vide** ;
- une **boucle triviale** (le sujet est identique à l'objet) ;
- du **texte corrompu** (mojibake, caractères de contrôle) ;
- un **sujet ou objet non-entité** : pronom non résolu, déterminant ou copule isolé, fragment
  mono-caractère — bref, rien qu'on puisse interroger ;
- un **prédicat non significatif**.

Ce qu'il **ne** vise **pas** : un fait simplement « pas idéal » mais compréhensible reste en mémoire.
La **longueur** d'une valeur n'est jamais un motif de suppression (une valeur longue peut être
parfaitement légitime).

## Quand et comment

Les deux tournent **en arrière-plan**, **automatiquement**, après les actions d'écriture (ingestion
d'un document, validation de faits…). L'ordre est volontaire :

1. **FactAdjuster d'abord** — on **sauve** ce qui est récupérable ;
2. **Garbage Collector ensuite** — on n'**efface** que ce qui reste vraiment sans valeur.

Le résultat est résumé à l'utilisateur, et **tout est annulable** (archive temporelle). La mémoire
reste ainsi **dense et fiable** sans intervention manuelle.

## L'API en pratique

Les deux composants opèrent sur une `KnowledgeBase`. Ils exposent un **dry-run** (`scan`, ne modifie
rien) et une **application** (`collect` / `apply`).

### Garbage Collector

```ts
import { FactGarbageCollector } from '@damba/libxn';

const gc = new FactGarbageCollector(kb);

// 1) Inspecter sans rien retirer (réversible de toute façon, mais utile pour décider).
const candidates = gc.scan();
//    → [{ s, p, o, rule: 'non-entity-subject', reason: '…' }, …]

// 2) Ramasser : retract (archive) le déchet, renvoie un rapport.
const report = gc.collect();
//    → { scanned, collected: [...], protectedSkipped }
```

Règles **conservatrices** par défaut (langue-aware via le pack de langue). On peut en ajouter pour un
domaine — par exemple « objet trop long » (désactivée par défaut, car longueur ≠ absence de sens) :

```ts
import { oversizedObjectRule } from '@damba/libxn';

new FactGarbageCollector(kb, { extraRules: [oversizedObjectRule(280)] }).collect();
```

### FactAdjuster

Il relit le **contexte source** via un petit port `ContextResolver` que l'hôte fournit (un tour de
chat, un passage de document…) :

```ts
import { FactAdjuster, type ContextResolver } from '@damba/libxn';

const resolver: ContextResolver = {
  contextFor: (fact) => documentTextFor(fact),   // ← l'hôte sait d'où vient le fait
};

const adjuster = new FactAdjuster(kb, resolver);
adjuster.scan();          // corrections PROPOSÉES (dry-run)
await adjuster.apply();   // retract l'ancien + écrit le corrigé
//    → { adjusted: [{ before, after, reason }, …] }
```

### L'ordre recommandé

```ts
// 1) Réparer ce qui est récupérable, PUIS 2) effacer ce qui reste sans valeur.
await new FactAdjuster(kb, resolver).apply();
new FactGarbageCollector(kb).collect();
```

## Quand l'utiliser

- **Après l'ingestion d'un gros document** (un livre, un dossier) — c'est là que naissent les pronoms
  non résolus et les fragments. Un worker en tâche de fond enchaîne `buildDocumentPlan` → `FactAdjuster`
  → `FactGarbageCollector`, puis persiste : la mémoire est propre sans bloquer l'utilisateur.
- **En entretien périodique** d'une grosse mémoire — un passage régulier garde la base dense.
- **Sur commande** — une action explicite (« nettoie la mémoire ») déclenche la même passe et en
  rapporte le bilan.

> **À ne pas utiliser pour** : retoucher des faits *corrects mais imparfaits* (formulation, casse). Le
> GC ne touche **que** le sans-sens ; l'Adjuster **que** ce qu'il peut déduire **sans ambiguïté**. Pour
> une correction humaine arbitraire, passez par l'édition de fait classique.
