# Hygiène des faits — Garbage Collector & FactAdjuster

À grande échelle (un livre, des milliers de messages), l'extraction produit parfois des faits
imparfaits : un pronom non résolu, du texte corrompu, un fragment sans valeur. QPath se **maintient
tout seul**, en arrière-plan, avec deux mécanismes complémentaires et **toujours réversibles**.

> **Principe partagé.** Rien n'est jamais supprimé définitivement : la rétractation est une **archive
> temporelle** (le fait reste consultable dans l'historique et restaurable). Les faits **décidés par
> un humain** (verrouillés / actés) ne sont **jamais** touchés. Les faits **secrets** (coffre) sont
> ignorés. Tout est **langue-agnostique** (le vocabulaire vient d'un pack de langue injectable).

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
