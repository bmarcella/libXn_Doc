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

## En pratique

Un flux vit dans des **faits** ; un exécuteur les parcourt. On câble une mémoire, on déclare les
outils (les capacités à effet de bord), on pose les faits du flux, puis on l'exécute — la sortie est
une **trace** déterministe, sans LLM.

```ts
import {
  XNeuroneGrid, KnowledgeBase, LayeredKnowledgeBase,
  FlowRunner, ToolRegistry, promoteFacts, rollbackRelease,
} from '@damba/libxn';

// 1. Un outil = une vraie capacité (ici un simple "log" ; brancher email, http, db…)
const tools = new ToolRegistry().register({
  name: 'log',
  description: 'Affiche un message',
  run: async (input) => ({ text: String(input['msg'] ?? '') }),
});

// 2. La PROD : le flux vit dans des faits (condition → action)
const prod = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await prod.tell('accueil', 'entree', 'verif');
await prod.tell('verif', 'si', 'user est premium');
await prod.tell('verif', 'alors', 'msg_premium');
await prod.tell('verif', 'sinon', 'msg_basique');
await prod.tell('msg_premium', 'action', 'log');
await prod.tell('msg_premium', 'arg.msg', 'Bienvenue, membre premium.');
await prod.tell('msg_basique', 'action', 'log');
await prod.tell('msg_basique', 'arg.msg', 'Bienvenue.');

// 3. Exécuter : on récupère la trace (déterministe, tracée, 0 LLM)
const trace = await new FlowRunner(prod, tools).run('accueil');
console.log(trace);  // → branche "msg_basique" (aucun fait premium en mémoire)

// 4. DEV : une surcouche par-dessus PROD. UN fait ajouté reroute le flux,
//    la PROD en cours n'est PAS touchée.
const dev = new LayeredKnowledgeBase(
  new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true })),
  [prod],
);
await dev.tell('user', 'est', 'premium');
await new FlowRunner(dev, tools).run('accueil');  // → branche "msg_premium"

// 5. Promouvoir le fait validé DEV → PROD (release taguée), annulable.
await promoteFacts(dev.primary, prod, 'v1');  // la PROD bascule premium
rollbackRelease(prod, 'v1');                  // retour à l'état précédent (archivé)
```

Chaque pas de la trace porte son **déclencheur** (le fait qui l'a routé) ; l'exécution est bornée
(budget de pas + `max_iter`) et **rejouable**.

## Exemples détaillés par flot de contrôle

Pour chaque construct : un **problème concret**, le **code TypeScript** qui le résout, et le
**résultat**. (Les imports du premier exemple valent pour les suivants.)

### 1. Séquence — enchaîner des étapes (`puis`)

**Problème.** À l'inscription : créer le compte, envoyer l'email de bienvenue, puis journaliser —
dans cet ordre. Et pouvoir **insérer une étape** (un essai gratuit) sans toucher au code.

```ts
import { XNeuroneGrid, KnowledgeBase, FlowRunner, ToolRegistry } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry()
  .register({ name: 'db',    description: 'Écrit en base',   run: async () => ({ text: 'compte créé' }) })
  .register({ name: 'email', description: 'Envoie un email', run: async (i) => ({ text: `email:${i['modele']}` }) })
  .register({ name: 'log',   description: 'Journalise',      run: async (i) => ({ text: String(i['msg']) }) });

// la séquence, en faits
await kb.tell('inscription', 'entree', 'creer');
await kb.tell('creer', 'action', 'db');        await kb.tell('creer', 'puis', 'bienvenue');
await kb.tell('bienvenue', 'action', 'email'); await kb.tell('bienvenue', 'arg.modele', 'welcome');
await kb.tell('bienvenue', 'puis', 'journal');
await kb.tell('journal', 'action', 'log');     await kb.tell('journal', 'arg.msg', 'Nouvel inscrit');

await new FlowRunner(kb, tools).run('inscription');
// → db → email:welcome → log("Nouvel inscrit")

// INSÉRER "essai_gratuit" entre creer et bienvenue, sans toucher au code :
kb.retract('creer', 'puis', 'bienvenue');          // on débranche l'ancien lien
await kb.tell('creer', 'puis', 'essai_gratuit');
await kb.tell('essai_gratuit', 'action', 'db');    await kb.tell('essai_gratuit', 'puis', 'bienvenue');

await new FlowRunner(kb, tools).run('inscription');
// → db → db(essai) → email:welcome → log(...)   ← une étape ajoutée par 3 faits
```

**Résultat.** L'ordre vit dans les faits `puis` ; insérer ou retirer une étape, c'est quelques
`tell` / `retract`, jamais un redéploiement.

### 2. Condition — brancher sur un fait (`si` / `alors` / `sinon`)

**Problème.** Réserver le panneau admin aux admins (sinon une 403), et pouvoir **donner ou retirer
le droit à chaud**.

```ts
// (mêmes imports qu'au-dessus)
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const ui = new ToolRegistry().register({
  name: 'afficher', description: 'Rend une vue', run: async (i) => ({ text: `vue:${i['vue']}` }),
});

await kb.tell('acces', 'entree', 'porte');
await kb.tell('porte', 'si', 'user role admin');
await kb.tell('porte', 'alors', 'admin'); await kb.tell('porte', 'sinon', 'refus');
await kb.tell('admin', 'action', 'afficher'); await kb.tell('admin', 'arg.vue', 'admin');
await kb.tell('refus', 'action', 'afficher'); await kb.tell('refus', 'arg.vue', '403');

await new FlowRunner(kb, ui).run('acces');   // → vue:403   (pas admin)
await kb.tell('user', 'role', 'admin');      // on DONNE le droit, à chaud
await new FlowRunner(kb, ui).run('acces');   // → vue:admin
kb.retract('user', 'role', 'admin');         // on le RETIRE
await new FlowRunner(kb, ui).run('acces');   // → vue:403
```

**Résultat.** `si "user role admin"` lit la mémoire (0 token) ; l'accès s'ouvre ou se coupe en
posant ou rétractant un fait. Forme courte `si "user actif"` = vrai si `(user, actif)` a une valeur.

#### Variante « sinon si » (else-if) — chaîner les conditions

**Problème.** Remise par paliers : or → 20 %, sinon argent → 10 %, sinon plein tarif. Pas de mot-clé
dédié : le `sinon` **pointe vers une autre condition**.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'remise', description: 'Applique une remise', run: async (i) => ({ text: `-${i['taux']}%` }),
});

await kb.tell('prix', 'entree', 'or');
await kb.tell('or', 'si', 'user niveau or');
await kb.tell('or', 'alors', 'r20'); await kb.tell('or', 'sinon', 'argent');     // sinon → AUTRE condition
await kb.tell('argent', 'si', 'user niveau argent');
await kb.tell('argent', 'alors', 'r10'); await kb.tell('argent', 'sinon', 'plein');
await kb.tell('r20', 'action', 'remise');   await kb.tell('r20', 'arg.taux', '20');
await kb.tell('r10', 'action', 'remise');   await kb.tell('r10', 'arg.taux', '10');
await kb.tell('plein', 'action', 'remise'); await kb.tell('plein', 'arg.taux', '0');

await kb.tell('user', 'niveau', 'argent');
await new FlowRunner(kb, tools).run('prix');   // or ? non → argent ? oui → -10%
```

**Résultat.** « si or … sinon si argent … sinon plein tarif » par simple chaînage. Règle de choix :
`switch` quand on teste la **même valeur** ; sinon-si quand les conditions **diffèrent**.

### 3. Condition numérique — comparer une valeur (`si "s p OP n"`)

**Problème.** Livraison gratuite au-delà de 50 € ; le **seuil** doit pouvoir changer sans redéploy.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'frais', description: 'Applique des frais', run: async (i) => ({ text: `${i['montant']} €` }),
});

await kb.tell('checkout', 'entree', 'seuil');
await kb.tell('panier', 'total', '64');
await kb.tell('seuil', 'si', 'panier total >= 50');     // le seuil vit DANS un fait
await kb.tell('seuil', 'alors', 'gratuit'); await kb.tell('seuil', 'sinon', 'payant');
await kb.tell('gratuit', 'action', 'frais'); await kb.tell('gratuit', 'arg.montant', '0');
await kb.tell('payant', 'action', 'frais');  await kb.tell('payant', 'arg.montant', '5.90');

await new FlowRunner(kb, tools).run('checkout');   // 64 >= 50 → 0 € (gratuit)

// changer le SEUIL sans redéploy : on remplace le fait condition
kb.retract('seuil', 'si', 'panier total >= 50');
await kb.tell('seuil', 'si', 'panier total >= 75');
await new FlowRunner(kb, tools).run('checkout');   // 64 >= 75 ? non → 5.90 € (payant)
```

**Résultat.** Opérateurs `>` `>=` `<` `<=` `=` `!=`. Le seuil est une **donnée** → un gestionnaire
l'ajuste à chaud. Autres cas : `si "user age >= 18"`, `si "stock quantite < 5"`.

### 4. Aiguillage — router sur une valeur (`switch` / `cas.<v>` / `défaut`)

**Problème.** Aiguiller un ticket vers la bonne file selon sa priorité, et **ajouter une catégorie**
sans toucher l'exécuteur.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'affecter', description: 'Affecte à une équipe', run: async (i) => ({ text: `→ ${i['equipe']}` }),
});

await kb.tell('support', 'entree', 'triage');
await kb.tell('ticket', 'priorite', 'haute');
await kb.tell('triage', 'switch', 'ticket priorite');
await kb.tell('triage', 'cas.haute', 'urgent'); await kb.tell('triage', 'cas.basse', 'differe');
await kb.tell('triage', 'défaut', 'n1');
await kb.tell('urgent', 'action', 'affecter');  await kb.tell('urgent', 'arg.equipe', 'astreinte');
await kb.tell('differe', 'action', 'affecter'); await kb.tell('differe', 'arg.equipe', 'backlog');
await kb.tell('n1', 'action', 'affecter');      await kb.tell('n1', 'arg.equipe', 'support_n1');

await new FlowRunner(kb, tools).run('support');   // priorite=haute → astreinte

// AJOUTER une catégorie "critique", sans toucher l'exécuteur :
await kb.tell('triage', 'cas.critique', 'escalade');
await kb.tell('escalade', 'action', 'affecter'); await kb.tell('escalade', 'arg.equipe', 'direction');
kb.retract('ticket', 'priorite', 'haute'); await kb.tell('ticket', 'priorite', 'critique');
await new FlowRunner(kb, tools).run('support');   // priorite=critique → direction
```

**Résultat.** La valeur choisit `cas.<valeur>` ; sans correspondance → `défaut`. Une nouvelle
catégorie = deux faits, zéro code.

### 5. Boucle bornée — itérer sur une collection (`pour_chaque` / `corps` / `max_iter`)

**Problème.** Envoyer une campagne à une liste, mais **plafonner** pour éviter tout sur-envoi
(anti-emballement).

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const sent: string[] = [];
const tools = new ToolRegistry().register({
  name: 'email', description: 'Envoie un email',
  run: async (i) => { sent.push(String(i['a'])); return { text: `→ ${i['a']}` }; },
});

await kb.tell('campagne', 'entree', 'diffuser');
for (const d of ['alice', 'bob', 'carol']) { await kb.tell('liste', 'destinataire', d); }
await kb.tell('diffuser', 'pour_chaque', 'liste destinataire');
await kb.tell('diffuser', 'corps', 'envoyer');
await kb.tell('diffuser', 'max_iter', '2');          // PLAFOND : 2 au maximum
await kb.tell('envoyer', 'action', 'email'); await kb.tell('envoyer', 'arg.a', '$item');

await new FlowRunner(kb, tools).run('campagne');
console.log(sent);   // ['alice', 'bob']  ← 2 sur 3, jamais d'emballement
```

**Résultat.** `pour_chaque` itère sur `(liste, destinataire)`, `$item` = l'élément courant,
`max_iter` **borne** → arrêt garanti. Cas voisins : relancer les paniers abandonnés, vider une file.

### 6. Action — déclencher une capacité (`action` + `arg.*`)

**Problème.** Quand une commande est payée, **notifier l'ERP** par webhook — sans coder ce point
d'intégration en dur dans le flux.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'http_post', description: 'POST HTTP',
  run: async (i) => {
    // await fetch(String(i['url']), { method: 'POST', body: String(i['corps']) });
    return { text: `POST ${i['url']}` };
  },
});

await kb.tell('commande_payee', 'entree', 'notifier');
await kb.tell('notifier', 'action', 'http_post');
await kb.tell('notifier', 'arg.url', 'https://erp.interne/commandes');
await kb.tell('notifier', 'arg.corps', 'commande #4187 payée');

await new FlowRunner(kb, tools).run('commande_payee');   // POST https://erp.interne/commandes
```

**Résultat.** L'`action` appelle l'**outil** déclaré (`http_post`, `email`, `db`…) et les `arg.*`
sont ses paramètres. L'outil = la vraie capacité ; le flux ne fait que l'**orchestrer**.

### Un flux complet — tunnel de commande

**Problème.** Un tunnel de bout en bout : vérifier le stock (condition), router selon le paiement
(aiguillage), réserver chaque article (boucle), confirmer (action) — entièrement piloté par faits.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry()
  .register({ name: 'payer',       description: 'Capture le paiement', run: async (i) => ({ text: `payé via ${i['fournisseur']}` }) })
  .register({ name: 'stock_moins', description: 'Décrémente le stock', run: async (i) => ({ text: `-1 ${i['sku']}` }) })
  .register({ name: 'email',       description: 'Email',               run: async (i) => ({ text: `mail:${i['modele']}` }) });

// données de la commande
await kb.tell('stock', 'disponible', 'oui');
await kb.tell('commande', 'moyen_paiement', 'carte');
await kb.tell('commande', 'article', 'sku-001'); await kb.tell('commande', 'article', 'sku-002');

// le flux
await kb.tell('cmd', 'entree', 'verif');
await kb.tell('verif', 'si', 'stock disponible oui');
await kb.tell('verif', 'alors', 'paiement'); await kb.tell('verif', 'sinon', 'rupture');
await kb.tell('paiement', 'switch', 'commande moyen_paiement');
await kb.tell('paiement', 'cas.carte', 'capture'); await kb.tell('paiement', 'défaut', 'capture');
await kb.tell('capture', 'action', 'payer'); await kb.tell('capture', 'arg.fournisseur', 'stripe');
await kb.tell('capture', 'puis', 'reserver');
await kb.tell('reserver', 'pour_chaque', 'commande article');
await kb.tell('reserver', 'corps', 'dec'); await kb.tell('reserver', 'max_iter', '200');
await kb.tell('reserver', 'puis', 'confirmer');
await kb.tell('dec', 'action', 'stock_moins'); await kb.tell('dec', 'arg.sku', '$item');
await kb.tell('confirmer', 'action', 'email'); await kb.tell('confirmer', 'arg.modele', 'confirmation');
await kb.tell('rupture', 'action', 'email');   await kb.tell('rupture', 'arg.modele', 'rupture_stock');

const trace = await new FlowRunner(kb, tools).run('cmd');
// stock oui → switch carte → payer(stripe) → dec sku-001, dec sku-002 → mail:confirmation
```

**Résultat.** Les six constructs orchestrés par des faits, dans une seule trace déterministe.

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
**annulable** d'un geste (les faits rétractés sont archivés, jamais perdus). Voir [Sous-couches](layers).

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
