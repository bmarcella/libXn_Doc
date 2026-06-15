# Code dynamique

Un mode où **le comportement de l'application vit dans des faits**, pas dans du code figé. Le flot
de contrôle — conditions, aiguillages, boucles, actions — est stocké comme des faits ordinaires, et
un exécuteur les parcourt. **Ajouter un fait = changer le comportement, sans redéployer.**

```
accueil entree verif
verif si "user est premium"
verif alors message_premium
verif sinon message_basique
message_premium action notifier
message_premium arg.texte "Bienvenue, membre premium."
```

Le même flux produit deux comportements selon **un seul fait** : ajouter `user est premium` route
vers la branche premium. Le tout **déterministe, tracé, à 0 token**.

## Ce qu'il sait faire

| Construct | Rôle | Exemple |
|-----------|------|---------|
| **Condition** | brancher selon un fait | `si "user est premium"` → `alors` / `sinon` |
| **Condition numérique** | comparer une valeur | `si "user age >= 18"` |
| **Aiguillage** (switch) | router selon une valeur | `switch "user plan"` → `cas.gold` / `défaut` |
| **Boucle bornée** | itérer sur une collection | `pour_chaque "panier article"`, `max_iter 50` |
| **Action** | déclencher une capacité | `action notifier` + arguments |

Chaque exécution rend sa **trace complète** — quelle étape, déclenchée par quel fait — comme tout
le reste de la mémoire : auditable.

## Les conventions

Tout est triplet ordinaire ; seuls les **prédicats** sont conventionnels :

- `entree` — le point de départ d'un flux ;
- `si` / `alors` / `sinon` — la condition (évaluée par une **lecture de la mémoire**, donc 0 token) ;
- `switch` / `cas.<valeur>` / `défaut` — l'aiguillage ;
- `pour_chaque` / `corps` / `max_iter` — la boucle (toujours **bornée**) ;
- `action` / `arg.<clé>` / `puis` — l'action et la suite.

Les **actions** sont la seule brique à effet de bord : elles déclenchent un **outil** déclaré
(recherche, calcul, envoi…). Ajouter une étape recompose des capacités existantes ; elle n'en
invente pas de nouvelle — pour ça, on enregistre un nouvel outil.

## Exemples détaillés par flot de contrôle

Pour chaque construct : un **cas d'usage réel**, les **faits** qui le définissent (un triplet par
ligne), et le **comportement** obtenu.

### 1. Séquence — enchaîner des étapes (`puis`)

**Cas d'usage : inscription d'un utilisateur.** Trois étapes qui s'enchaînent.

```
inscription entree creer_compte
creer_compte action db_inserer
creer_compte arg.table "users"
creer_compte puis envoyer_bienvenue
envoyer_bienvenue action email
envoyer_bienvenue arg.modele "welcome"
envoyer_bienvenue puis journaliser
journaliser action log
journaliser arg.msg "Nouvel inscrit"
```

→ `db_inserer` puis `email` puis `log`. Insérer une étape (ex. `creer_essai_gratuit`) entre deux,
c'est ajouter un fait `puis` — sans toucher au code.

### 2. Condition — brancher sur un fait (`si` / `alors` / `sinon`)

**Cas d'usage : accès à une fonctionnalité réservée.** « L'utilisateur est-il admin ? »

```
verif_acces entree porte
porte si "user role admin"
porte alors panneau_admin
porte sinon refus
panneau_admin action afficher
panneau_admin arg.vue "admin"
refus action afficher
refus arg.vue "403"
```

→ `si "user role admin"` est vrai si la mémoire contient le fait `user role admin`. Donner ou retirer
ce fait ouvre ou coupe l'accès **à chaud**. Forme courte `si "user actif"` = vrai si `(user, actif)`
a au moins une valeur.

### 3. Condition numérique — comparer une valeur (`si "s p OP n"`)

**Cas d'usage : règle métier — livraison gratuite au-delà d'un seuil.**

```
checkout entree seuil_livraison
panier total 64
seuil_livraison si "panier total >= 50"
seuil_livraison alors livraison_gratuite
seuil_livraison sinon livraison_payante
livraison_gratuite action appliquer_frais
livraison_gratuite arg.montant "0"
livraison_payante action appliquer_frais
livraison_payante arg.montant "5.90"
```

→ Opérateurs disponibles : `>` `>=` `<` `<=` `=` `!=`. Le seuil (`50`) vit dans un fait : un
gestionnaire le change sans redéploy. Autres exemples : `si "user age >= 18"`, `si "stock quantite < 5"`.

### 4. Aiguillage — router sur une valeur (`switch` / `cas.<v>` / `défaut`)

**Cas d'usage : triage d'un ticket support par priorité.**

```
support entree triage
ticket priorite haute
triage switch "ticket priorite"
triage cas.haute file_urgente
triage cas.moyenne file_standard
triage cas.basse file_differee
triage défaut file_standard
file_urgente action affecter
file_urgente arg.equipe "astreinte"
file_standard action affecter
file_standard arg.equipe "support_n1"
file_differee action affecter
file_differee arg.equipe "backlog"
```

→ La valeur de `(ticket, priorite)` choisit la branche `cas.<valeur>` ; sans correspondance, on
retombe sur `défaut`. Ajouter une catégorie = ajouter un fait `cas.critique …`, sans toucher l'exécuteur.

### 5. Boucle bornée — itérer sur une collection (`pour_chaque` / `corps` / `max_iter`)

**Cas d'usage : diffuser une campagne, plafonnée pour éviter tout emballement.**

```
campagne entree diffuser
liste destinataire alice
liste destinataire bob
liste destinataire carol
diffuser pour_chaque "liste destinataire"
diffuser corps envoyer
diffuser max_iter 100
diffuser puis bilan
envoyer action email
envoyer arg.a "$item"
envoyer arg.modele "promo"
bilan action log
bilan arg.msg "Campagne terminée"
```

→ `pour_chaque "liste destinataire"` itère sur les objets de `(liste, destinataire)`. Dans le corps,
`$item` est remplacé par le destinataire courant (`alice`, puis `bob`, puis `carol`). `max_iter 100`
**borne** la boucle → arrêt garanti, jamais d'emballement. Cas voisins : relancer les paniers
abandonnés, traiter une file de tâches.

### 6. Action — déclencher une capacité (`action` + `arg.*`)

**Cas d'usage : notifier un système externe (webhook).**

```
commande_payee entree notifier_erp
notifier_erp action http_post
notifier_erp arg.url "https://erp.interne/commandes"
notifier_erp arg.corps "commande #4187 payée"
```

→ L'`action` appelle un **outil déclaré** (`http_post`, `email`, `db_inserer`, `calcul`…) et les
`arg.*` sont ses paramètres. Un outil = une vraie capacité branchée par l'équipe ; le flux ne fait
que les **orchestrer**.

### Un flux complet — tunnel de commande

Les constructs combinés : vérifier le stock (condition), router selon le paiement (aiguillage),
réserver chaque article (boucle), confirmer (action).

```
commande entree verif_stock
stock disponible oui
commande moyen_paiement carte
commande article sku-001
commande article sku-002
verif_stock si "stock disponible oui"
verif_stock alors paiement
verif_stock sinon rupture
paiement switch "commande moyen_paiement"
paiement cas.carte capture_carte
paiement cas.paypal capture_paypal
paiement défaut capture_carte
capture_carte action payer
capture_carte arg.fournisseur "stripe"
capture_carte puis reserver_articles
capture_paypal action payer
capture_paypal arg.fournisseur "paypal"
capture_paypal puis reserver_articles
reserver_articles pour_chaque "commande article"
reserver_articles corps decrementer
reserver_articles max_iter 200
reserver_articles puis confirmer
decrementer action stock_moins
decrementer arg.sku "$item"
confirmer action email
confirmer arg.modele "confirmation"
rupture action email
rupture arg.modele "rupture_stock"
```

→ Trace : stock disponible → `paiement` → moyen = carte → `capture_carte` (payer via stripe) →
`reserver_articles` qui décrémente `sku-001` puis `sku-002` → `confirmer` (email de confirmation).

### Récapitulatif — quel construct pour quel besoin

| Besoin | Construct | Prédicats |
|--------|-----------|-----------|
| Enchaîner des étapes | Séquence | `puis` |
| Décider selon un fait présent | Condition | `si "s p o"` · `alors` · `sinon` |
| Décider selon un seuil chiffré | Condition numérique | `si "s p >= n"` |
| Router parmi plusieurs cas | Aiguillage | `switch` · `cas.<v>` · `défaut` |
| Répéter sur une liste (plafonné) | Boucle bornée | `pour_chaque` · `corps` · `max_iter` |
| Agir sur le monde | Action | `action` · `arg.<k>` |

## Tester sans risque : dev / prod

La mémoire se travaille en **couches** : la prod tourne en lecture seule, et une **surcouche dev**
reçoit les nouveaux faits. On y teste un changement de comportement **sans toucher la prod**, on
visualise la trace, puis on **promeut** les faits validés vers la prod — une **release** taguée,
**annulable** d'un geste (les faits rétractés sont archivés, jamais perdus).

```
dev : ajouter/ajuster des faits → exécuter → vérifier la trace
   └ promouvoir (release) → prod      ·      annuler la release → retour à l'état précédent
```

## Les garanties

- **Déterministe** : à mémoire et outils donnés, le même flux donne toujours la même trace.
- **Bornée** : budget de pas global + `max_iter` par boucle → **arrêt garanti**, même sur un cycle.
- **Tracée & explicable** : chaque pas porte son déclencheur ; aucune décision opaque.
- **0 token** pour les conditions : elles sont de simples lectures de la mémoire.

## Quand l'utiliser

| Situation | Mode conseillé |
|-----------|----------------|
| Propriétés, classes, attributs (« qui est quoi ») | déduction symbolique classique |
| « Pourquoi », « qu'est-ce qui a mené à », « dans quel ordre » | Plot Reasoning |
| Raisonnement ouvert validé pas à pas | PingPong |
| **Comportement applicatif modifiable à chaud, testé en dev puis promu en prod** | **Code dynamique** |
