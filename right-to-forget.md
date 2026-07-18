# Le droit à l'oubli, prouvé

Presque tous les assistants savent aujourd'hui écrire du texte convaincant. Très peu savent
**oublier proprement** ce qu'on leur a confié, en le prouvant. C'est un scénario que QPath fait de
bout en bout, et que la plupart des produits d'IA ne peuvent pas garantir.

## Le scénario

Un cabinet utilise QPath comme mémoire d'entreprise. Sur six mois, des dizaines de collaborateurs l'ont
nourri en langage naturel, sans formulaire ni base de données à gérer :

> « Le client Acme est en France. »
> « Nos clients français sont facturés en euros. »
> « Acme a un contact principal, Marie. »
> « L'email de Marie, c'est marie@acme.fr. »

Puis Acme part. L'utilisateur écrit une seule phrase :

> « Retire Acme. »

## Ce qui se passe, et pourquoi c'est rare

### 1. Le retrait cascade sur tout ce qui dépendait d'Acme

Chaque information ingérée à propos d'Acme a été rattachée à ce dossier au moment où elle est entrée.
Retirer Acme retire donc, d'un seul geste, l'ensemble du dossier : le contact, l'email, et même les
informations qui avaient été **déduites** par une règle métier (« facturé en euros » venait de la règle
« clients français, donc euros »). Rien ne traîne, aucun résidu à nettoyer à la main.

### 2. Rien n'est réellement effacé, tout est archivé dans le temps

Un retrait ne détruit pas la donnée : il l'archive avec sa date. On peut donc demander plus tard :

> « Qu'est-ce que je savais d'Acme au 3 mars ? »

et QPath répond l'état exact à cette date. C'est un oubli **conforme et réversible** : l'information
sort de l'usage courant, mais l'historique reste auditable. C'est précisément ce qu'exige un droit à
l'oubli sérieux, et ce qu'un modèle qui se contente de générer du texte ne peut pas offrir : il ne
« désapprend » pas une information, et ne connaît aucune date de vérité.

### 3. La réponse suivante ne peut pas être inventée

Si quelqu'un redemande l'email de Marie après le retrait, QPath répond :

> « Cette information a été retirée le 9 juillet. »

Il lit sa mémoire de faits, il ne **fabrique** pas une réponse plausible. Un produit qui répond en
générant du texte peut, lui, proposer un email vraisemblable mais faux. Ici, chaque réponse porte sa
**source** (qui l'a dit, quand) et son statut (active, retirée, archivée).

### 4. Ce qui était secret l'est resté du début à la fin

Si l'email de Marie avait été marqué **secret**, il aurait été chiffré au repos, masqué des lectures
normales, et **exclu du raisonnement** même avant le retrait. La mémoire raisonne sur le dossier sans
jamais voir le secret en clair.

## Le point unique

Aucune de ces briques prise isolément n'est magique. Ce que QPath fait, et qui reste rare, c'est leur
**combinaison, de façon déterministe** :

- une mémoire qui répond **instantanément**, avec sa **provenance** ;
- qui **ne peut pas halluciner** ce qu'elle sait ou ne sait pas ;
- dont on retire un fait **et toute sa descendance logique** d'un seul geste ;
- en conservant l'**historique daté** ;
- et le **chiffrement des secrets** tout du long.

C'est une propriété de la façon dont QPath **représente** la connaissance, pas une option ajoutée par
dessus un générateur de texte. La mémoire est inspectable, corrigeable et réversible par construction.

## Là où ça compte

- **Conformité et vie privée** : répondre à une demande de suppression (RGPD, loi 25 au Québec) en
  montrant *ce qui* a été retiré, *quand*, et *ce qui en découlait*.
- **Secteurs régulés** (santé, finance, juridique) : toute donnée servie porte sa preuve d'origine.
- **Mémoire d'équipe durable** : on accumule des mois de connaissances sans craindre de ne plus pouvoir
  faire le ménage proprement.

## Essayer l'idée

Dans QPath, tout se pilote en langage naturel : on informe, on demande, on rectifie, on retire, par
phrases simples. Il n'y a rien à programmer pour obtenir ce comportement.

Pour comprendre les mécanismes qui rendent ce scénario possible :

- [Faits compagnons](companion-facts) : comment un dossier regroupe ses informations pour un retrait en cascade.
- [Hygiène des faits](fact-maintenance) : retrait, archivage, fraîcheur.
- [Provenance](fact-provenance) : la source et la date de chaque réponse.
- [Couche d'accès](access-layer) : secrets chiffrés et contrôle d'accès.

::: tip En une phrase
Un assistant qui sait aussi bien **oublier** que retenir, et qui peut le **prouver**.
:::
