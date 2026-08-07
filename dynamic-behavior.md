# Factflow

Un mode où **le comportement de l'application vit dans des faits**, pas dans du code figé. Le flot
de contrôle — conditions, aiguillages, boucles, actions — est stocké comme des faits ordinaires, et
un exécuteur les parcourt. **Ajouter un fait = changer le comportement, sans redéployer.**

Les mots-clés de flux sont en **anglais** (universels) : `entry`, `if` / `then` / `else`,
`switch` / `case.` / `default`, `for_each` / `body` / `max_iter`, `action` / `arg.` / `next`.

```
accueil entry verif
verif if "user est premium"
verif then message_premium
verif else message_basique
message_premium action notifier
message_premium arg.texte "Bienvenue, membre premium."
```

Le même flux produit deux comportements selon **un seul fait** : ajouter `user est premium` route
vers la branche premium. Le tout **déterministe, tracé, à 0 token**.

## Ce qu'il sait faire

| Construct | Rôle | Exemple |
|-----------|------|---------|
| **Condition** | brancher selon un fait | `if "user est premium"` → `then` / `else` |
| **Condition numérique** | comparer une valeur | `if "user age >= 18"` |
| **Condition de date** | comparer à aujourd'hui | `if "$event echeance < today"`, `if "$event embauche older_than 365"` |
| **Aiguillage** (switch) | router selon une valeur | `switch "user plan"` → `case.gold` / `default` |
| **Boucle bornée** | itérer sur une collection | `for_each "panier article"`, `max_iter 50` |
| **Condition déductive** | conclure par héritage au lieu de lire | `if "?? $event a badge"` — la trace porte le chemin suivi |
| **Lire un fait** | se servir de la mémoire dans un argument ou une condition | `arg.o = $fact($event nom)` |
| **Chaîner** | passer le résultat d'une étape à la suivante | `arg.body = $last` |
| **Boucle sur une classe** | itérer sur une population | `for_each "* est employe"` — tous les sujets de la classe, toujours borné par `max_iter` |
| **Action** | déclencher une capacité | `action notifier` + arguments |

Chaque exécution rend sa **trace complète** — quelle étape, déclenchée par quel fait — comme tout
le reste de la mémoire : auditable.

## Les conventions

Tout est triplet ordinaire ; seuls les **prédicats** sont conventionnels :

- `entry` — le point de départ d'un flux ;
- `if` / `then` / `else` — la condition (évaluée par une **lecture de la mémoire**, donc 0 token) ;
- `switch` / `case.<valeur>` / `default` — l'aiguillage ;
- `for_each` / `body` / `max_iter` — la boucle (toujours **bornée**) ;
- `action` / `arg.<clé>` / `next` — l'action et la suite.

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
await prod.tell('accueil', 'entry', 'verif');
await prod.tell('verif', 'if', 'user est premium');
await prod.tell('verif', 'then', 'msg_premium');
await prod.tell('verif', 'else', 'msg_basique');
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

Cet exemple mobilise sept API du noyau. Voici précisément ce que chacune attend.

**`new ToolRegistry().register(tool)`** — déclare une capacité à effet de bord. `register` prend **un
seul** argument, un objet `Tool`, et **retourne le registre lui-même** (chaînable :
`.register(a).register(b)`). Les champs de `tool` :

| Champ | Rôle | Défaut |
|---|---|---|
| `name` | identifiant unique de l'outil (insensible à la casse) ; c'est ce que vise un fait `(étape, action, name)` | — (requis) |
| `description` | description courte — sert à la sélection (par un LLM auteur) et à la doc | — (requis) |
| `run` | la fonction exécutée : `async (input: Record<string, unknown>) => ToolResult`. `input` reçoit les `arg.*` de l'étape (clés sans le préfixe `arg.`) | — (requis) |
| `resolves?` | prédicats que l'outil sait résoudre (liaison déterministe sur cache-miss) — inutile pour un flux piloté par `action` | `undefined` |
| `ephemeral?` | si `true`, les faits renvoyés ne sont **jamais** mémorisés (données volatiles) | `false` |

La valeur de retour de `run`, un **`ToolResult`**, a quatre champs tous optionnels : `text?` (texte
lisible repris dans la trace), `value?` (réponse directe non mémorisée), `facts?`
(`[s, p, o][]` réinjectés dans la mémoire) et `ephemeral?` (override par appel). Dans les exemples de
flux, on ne renvoie que `{ text }` : l'outil agit, et son texte apparaît dans la trace.

**`new KnowledgeBase(grid)`** — la mémoire. Un seul argument : la **grille** QPath qui sert de mémoire
de travail. `new XNeuroneGrid(undefined, { headless: true })` la construit en mode serveur :
`undefined` = encodeur par défaut, `{ headless: true }` = sans rendu Three.js (Node).

**`kb.tell(s, p, o)`** — écrit un fait. Les trois premiers arguments (sujet, prédicat, objet) sont les
seuls utilisés ici ; deux arguments optionnels suivent (`source?` pour la provenance, `flags?` pour
les drapeaux `major`/`closed`/… — voir [Types de faits](/fact-types)). `tell` est `async`.

**`new FlowRunner(kb, tools)`** — l'exécuteur. Deux arguments : la **`kb`** (où vivent les faits du
flux) et le **`tools`** (le `ToolRegistry` des capacités). Le second est **optionnel** (défaut : un
registre vide) — un flux sans `action` s'exécute sans outils.

**`runner.run(flow)`** — lance le flux nommé depuis son fait `(flow, entry, …)`. L'argument `flow`
est le **nom du flux** (le sujet qui porte `entry`). Un second argument `opts?` est optionnel :

| Option | Rôle | Défaut |
|---|---|---|
| `maxSteps` | budget de pas global — garantit l'arrêt même sur un cycle | `1000` |
| `context` | contexte d'exécution propre à l'appel : `{ event?, item? }`, substitué aux jetons `$event` / `$item` **partout où ils apparaissent** — arguments d'action, mais aussi expressions de `if`, de `switch` et de `for_each` (voir « Le contexte d'exécution » plus bas) | `undefined` (aucune substitution) |
| `allowedTools` | **allowlist au RUNTIME** : itérable des outils autorisés à s'exécuter. Une `action` hors liste est **tracée comme refusée et ignorée** (le flux continue), sans l'exécuter — garde d'exécution qui **double** la validation (`FlowValidator`, qui contrôle *avant*) | `undefined` (aucune restriction) |

`run` est `async` et **retourne la trace** : un `FlowStep[]`, chaque pas portant `{ step, kind, detail }`
(l'étape, son type `condition`/`switch`/`loop`/`action`/`goto`/`end`, et un détail lisible incluant le
déclencheur).

> **Isolation des erreurs d'outil.** Si un outil **lève** pendant une `action`, l'erreur est **capturée
> et tracée** (`… → (erreur outil : …)`) — elle n'interrompt **pas** le flux, qui poursuit à l'étape
> suivante. Un outil défaillant ne fait jamais tomber tout le comportement.

**`new LayeredKnowledgeBase(primary, parents)`** — la vue dev en couches. Deux arguments : `primary`
(la KB d'**écriture**, la surcouche dev) et `parents` (un tableau de KB **en lecture seule**, de la
plus à la moins spécifique — ici `[prod]`). Le second est optionnel (défaut `[]`). Lectures : le plus
spécifique gagne ; écritures : seulement dans `primary`. Le champ `.primary` réexpose cette surcouche
(c'est lui qu'on promeut).

**`promoteFacts(from, to, releaseId)`** — copie en prod les faits absents. Trois arguments : `from`
(la KB source, ici `dev.primary`), `to` (la cible, `prod`) et `releaseId` (l'étiquette de release,
attachée comme provenance `release:<id>` → c'est ce qui rend le `rollback` possible). `async`,
retourne le **nombre** de faits effectivement appliqués (les doublons déjà présents sont ignorés).

**`rollbackRelease(kb, releaseId)`** — annule une release. Deux arguments : la `kb` et le `releaseId`
exact passé à la promotion. Rétracte (archive, n'efface jamais) tous les faits portant cette
provenance ; retourne le **nombre** rétracté. Synchrone.

Chaque pas de la trace porte son **déclencheur** (le fait qui l'a routé) ; l'exécution est bornée
(budget de pas + `max_iter`) et **rejouable**.

## Exemples détaillés par flot de contrôle

Pour chaque construct : un **problème concret**, le **code TypeScript** qui le résout, et le
**résultat**. (Les imports du premier exemple valent pour les suivants.)

### 1. Séquence — enchaîner des étapes (`next`)

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
await kb.tell('inscription', 'entry', 'creer');
await kb.tell('creer', 'action', 'db');        await kb.tell('creer', 'next', 'bienvenue');
await kb.tell('bienvenue', 'action', 'email'); await kb.tell('bienvenue', 'arg.modele', 'welcome');
await kb.tell('bienvenue', 'next', 'journal');
await kb.tell('journal', 'action', 'log');     await kb.tell('journal', 'arg.msg', 'Nouvel inscrit');

await new FlowRunner(kb, tools).run('inscription');
// → db → email:welcome → log("Nouvel inscrit")

// INSÉRER "essai_gratuit" entre creer et bienvenue, sans toucher au code :
kb.retract('creer', 'next', 'bienvenue');          // on débranche l'ancien lien
await kb.tell('creer', 'next', 'essai_gratuit');
await kb.tell('essai_gratuit', 'action', 'db');    await kb.tell('essai_gratuit', 'next', 'bienvenue');

await new FlowRunner(kb, tools).run('inscription');
// → db → db(essai) → email:welcome → log(...)   ← une étape ajoutée par 3 faits
```

**Résultat.** L'ordre vit dans les faits `next` ; insérer ou retirer une étape, c'est quelques
`tell` / `retract`, jamais un redéploiement.

> 💡 **`kb.retract(s, p, o)`** prend le triplet **exact** à débrancher (les trois premiers arguments
> identifient le fait). Deux arguments optionnels suivent : `reason?` (motif d'archivage — rien n'est
> jamais effacé, seulement marqué `retracted_at`) et `now?` (horodatage, défaut `Date.now()`).
> Synchrone, retourne `true` si un fait correspondait. Pour **re-pointer** un prédicat de contrôle à
> valeur unique (`next`, `then`, `entry`…), il faut `retract` l'ancien **puis** `tell` le nouveau —
> un simple `tell` ajouterait une 2ᵉ valeur, et le premier inséré l'emporterait.

### 2. Condition — brancher sur un fait (`if` / `then` / `else`)

**Problème.** Réserver le panneau admin aux admins (sinon une 403), et pouvoir **donner ou retirer
le droit à chaud**.

```ts
// (mêmes imports qu'au-dessus)
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const ui = new ToolRegistry().register({
  name: 'afficher', description: 'Rend une vue', run: async (i) => ({ text: `vue:${i['vue']}` }),
});

await kb.tell('acces', 'entry', 'porte');
await kb.tell('porte', 'if', 'user role admin');
await kb.tell('porte', 'then', 'admin'); await kb.tell('porte', 'else', 'refus');
await kb.tell('admin', 'action', 'afficher'); await kb.tell('admin', 'arg.vue', 'admin');
await kb.tell('refus', 'action', 'afficher'); await kb.tell('refus', 'arg.vue', '403');

await new FlowRunner(kb, ui).run('acces');   // → vue:403   (pas admin)
await kb.tell('user', 'role', 'admin');      // on DONNE le droit, à chaud
await new FlowRunner(kb, ui).run('acces');   // → vue:admin
kb.retract('user', 'role', 'admin');         // on le RETIRE
await new FlowRunner(kb, ui).run('acces');   // → vue:403
```

**Résultat.** `if "user role admin"` lit la mémoire (0 token) ; l'accès s'ouvre ou se coupe en
posant ou rétractant un fait. Forme courte `if "user actif"` = vrai si `(user, actif)` a une valeur.

#### Variante « else-if » — chaîner les conditions

**Problème.** Remise par paliers : or → 20 %, sinon argent → 10 %, sinon plein tarif. Pas de mot-clé
dédié : le `else` **pointe vers une autre condition**.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'remise', description: 'Applique une remise', run: async (i) => ({ text: `-${i['taux']}%` }),
});

await kb.tell('prix', 'entry', 'or');
await kb.tell('or', 'if', 'user niveau or');
await kb.tell('or', 'then', 'r20'); await kb.tell('or', 'else', 'argent');     // else → AUTRE condition
await kb.tell('argent', 'if', 'user niveau argent');
await kb.tell('argent', 'then', 'r10'); await kb.tell('argent', 'else', 'plein');
await kb.tell('r20', 'action', 'remise');   await kb.tell('r20', 'arg.taux', '20');
await kb.tell('r10', 'action', 'remise');   await kb.tell('r10', 'arg.taux', '10');
await kb.tell('plein', 'action', 'remise'); await kb.tell('plein', 'arg.taux', '0');

await kb.tell('user', 'niveau', 'argent');
await new FlowRunner(kb, tools).run('prix');   // or ? non → argent ? oui → -10%
```

**Résultat.** « if or … else-if argent … else plein tarif » par simple chaînage. Règle de choix :
`switch` quand on teste la **même valeur** ; else-if quand les conditions **diffèrent**.

### 3. Condition numérique — comparer une valeur (`if "s p OP n"`)

**Problème.** Livraison gratuite au-delà de 50 € ; le **seuil** doit pouvoir changer sans redéploy.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'frais', description: 'Applique des frais', run: async (i) => ({ text: `${i['montant']} €` }),
});

await kb.tell('checkout', 'entry', 'seuil');
await kb.tell('panier', 'total', '64');
await kb.tell('seuil', 'if', 'panier total >= 50');     // le seuil vit DANS un fait
await kb.tell('seuil', 'then', 'gratuit'); await kb.tell('seuil', 'else', 'payant');
await kb.tell('gratuit', 'action', 'frais'); await kb.tell('gratuit', 'arg.montant', '0');
await kb.tell('payant', 'action', 'frais');  await kb.tell('payant', 'arg.montant', '5.90');

await new FlowRunner(kb, tools).run('checkout');   // 64 >= 50 → 0 € (gratuit)

// changer le SEUIL sans redéploy : on remplace le fait condition
kb.retract('seuil', 'if', 'panier total >= 50');
await kb.tell('seuil', 'if', 'panier total >= 75');
await new FlowRunner(kb, tools).run('checkout');   // 64 >= 75 ? non → 5.90 € (payant)
```

**Résultat.** Opérateurs `>` `>=` `<` `<=` `=` `!=`. Le seuil est une **donnée** → un gestionnaire
l'ajuste à chaud. Autres cas : `if "user age >= 18"`, `if "stock quantite < 5"`.

### 4. Aiguillage — router sur une valeur (`switch` / `case.<v>` / `default`)

**Problème.** Aiguiller un ticket vers la bonne file selon sa priorité, et **ajouter une catégorie**
sans toucher l'exécuteur.

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const tools = new ToolRegistry().register({
  name: 'affecter', description: 'Affecte à une équipe', run: async (i) => ({ text: `→ ${i['equipe']}` }),
});

await kb.tell('support', 'entry', 'triage');
await kb.tell('ticket', 'priorite', 'haute');
await kb.tell('triage', 'switch', 'ticket priorite');
await kb.tell('triage', 'case.haute', 'urgent'); await kb.tell('triage', 'case.basse', 'differe');
await kb.tell('triage', 'default', 'n1');
await kb.tell('urgent', 'action', 'affecter');  await kb.tell('urgent', 'arg.equipe', 'astreinte');
await kb.tell('differe', 'action', 'affecter'); await kb.tell('differe', 'arg.equipe', 'backlog');
await kb.tell('n1', 'action', 'affecter');      await kb.tell('n1', 'arg.equipe', 'support_n1');

await new FlowRunner(kb, tools).run('support');   // priorite=haute → astreinte

// AJOUTER une catégorie "critique", sans toucher l'exécuteur :
await kb.tell('triage', 'case.critique', 'escalade');
await kb.tell('escalade', 'action', 'affecter'); await kb.tell('escalade', 'arg.equipe', 'direction');
kb.retract('ticket', 'priorite', 'haute'); await kb.tell('ticket', 'priorite', 'critique');
await new FlowRunner(kb, tools).run('support');   // priorite=critique → direction
```

**Résultat.** La valeur choisit `case.<valeur>` ; sans correspondance → `default`. Une nouvelle
catégorie = deux faits, zéro code.

### 5. Boucle bornée — itérer sur une collection (`for_each` / `body` / `max_iter`)

**Problème.** Envoyer une campagne à une liste, mais **plafonner** pour éviter tout sur-envoi
(anti-emballement).

```ts
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const sent: string[] = [];
const tools = new ToolRegistry().register({
  name: 'email', description: 'Envoie un email',
  run: async (i) => { sent.push(String(i['a'])); return { text: `→ ${i['a']}` }; },
});

await kb.tell('campagne', 'entry', 'diffuser');
for (const d of ['alice', 'bob', 'carol']) { await kb.tell('liste', 'destinataire', d); }
await kb.tell('diffuser', 'for_each', 'liste destinataire');
await kb.tell('diffuser', 'body', 'envoyer');
await kb.tell('diffuser', 'max_iter', '2');          // PLAFOND : 2 au maximum
await kb.tell('envoyer', 'action', 'email'); await kb.tell('envoyer', 'arg.a', '$item');

await new FlowRunner(kb, tools).run('campagne');
console.log(sent);   // ['alice', 'bob']  ← 2 sur 3, jamais d'emballement
```

**Résultat.** `for_each` itère sur `(liste, destinataire)`, `$item` = l'élément courant,
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

await kb.tell('commande_payee', 'entry', 'notifier');
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
await kb.tell('cmd', 'entry', 'verif');
await kb.tell('verif', 'if', 'stock disponible oui');
await kb.tell('verif', 'then', 'paiement'); await kb.tell('verif', 'else', 'rupture');
await kb.tell('paiement', 'switch', 'commande moyen_paiement');
await kb.tell('paiement', 'case.carte', 'capture'); await kb.tell('paiement', 'default', 'capture');
await kb.tell('capture', 'action', 'payer'); await kb.tell('capture', 'arg.fournisseur', 'stripe');
await kb.tell('capture', 'next', 'reserver');
await kb.tell('reserver', 'for_each', 'commande article');
await kb.tell('reserver', 'body', 'dec'); await kb.tell('reserver', 'max_iter', '200');
await kb.tell('reserver', 'next', 'confirmer');
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
| Enchaîner des étapes | Séquence | `next` |
| Décider selon un fait présent | Condition | `if "s p o"` · `then` · `else` |
| Décider selon un seuil chiffré | Condition numérique | `if "s p >= n"` |
| Router parmi plusieurs cas | Aiguillage | `switch` · `case.<v>` · `default` |
| Répéter sur une liste (plafonné) | Boucle bornée | `for_each` · `body` · `max_iter` |
| Agir sur le monde | Action | `action` · `arg.<k>` |

## Référence des mots-clés

Chaque mot-clé est un **prédicat réservé**. Un nœud (le sujet du triplet) en porte un ou plusieurs
pour décrire une étape du flux.

| Mot-clé | Porté par | Ce qu'il fait | Comment l'utiliser |
|---------|-----------|---------------|--------------------|
| `entry` | le **flux** | désigne l'étape de départ | `(monFlux, entry, etape0)` |
| `if` | une étape | déclare une **condition** lue dans la mémoire (0 token) | `(e, if, "sujet predicat objet")` ou `"s p OP n"` |
| `then` | une étape `if` | étape suivante si la condition est **vraie** | `(e, then, etapeA)` |
| `else` | une étape `if` | étape suivante si **fausse** ; peut pointer vers une **autre condition** (= else-if) | `(e, else, etapeB)` |
| `switch` | une étape | **aiguille** selon la valeur d'un fait | `(e, switch, "sujet predicat")` |
| `case.<v>` | une étape `switch` | branche choisie quand la valeur vaut `<v>` | `(e, case.gold, etapeG)` |
| `default` | une étape `switch` | branche si aucun `case.` ne correspond | `(e, default, etapeD)` |
| `for_each` | une étape | **itère** sur les objets d'un fait | `(e, for_each, "sujet predicat")` |
| `body` | une étape `for_each` | l'étape exécutée pour chaque élément (`$item`) | `(e, body, etape)` |
| `max_iter` | une étape `for_each` | **plafond** d'itérations — garantit l'arrêt | `(e, max_iter, "100")` |
| `action` | une étape | exécute un **outil** déclaré (la seule brique à effet de bord) | `(e, action, nomOutil)` |
| `arg.<clé>` | une étape `action` | un **paramètre** passé à l'outil (`$item` substitué en boucle) | `(e, arg.msg, "Bonjour")` |
| `next` | une étape (action / boucle) | l'étape suivante en **séquence** | `(e, next, etapeSuivante)` |

**Ordre d'évaluation d'un nœud** : `if` → `switch` → `for_each` → `action` → `next`. Un nœud est
d'**un seul type** (condition, switch, boucle ou action) ; on ne mélange pas `if` et `switch` sur le
même nœud. Les objets sont normalisés (minuscules) ; la casse d'affichage des `arg.*` est préservée.

### Pourquoi des faits, et pas un builder `ifFact().else()` ?

Le flux **est** des faits — c'est volontaire, et c'est ce qui lui donne sa valeur :

- **stocké et interrogeable** comme tout le reste de la mémoire ;
- **en couches** (dev/prod), **promouvable** et **annulable** (release / rollback) ;
- **persistant** et **éditable à chaud** (ajouter / rétracter un fait) ;
- **traçable** (chaque pas porte le fait qui l'a déclenché).

Une facade par construct (`ifFact()`, `switchFact()`…) réintroduirait des **classes** là où le design
pose que les « fact types » ne sont **pas des classes** mais des conventions de triplets ; et si la
facade devenait la représentation exécutée, on **perdrait** toutes ces propriétés (un second chemin
d'exécution divergerait des faits). Un éventuel **builder fluent** reste le bienvenu — mais seulement
comme **sucre qui émet des faits**, jamais comme runtime parallèle. Plusieurs surfaces d'écriture
(triplets bruts, builder, langage naturel, éditeur visuel) convergent vers **une seule source de
vérité : les faits**.

## Tester sans risque : dev / prod

La mémoire se travaille en **couches** : la prod tourne en lecture seule, et une **surcouche dev**
reçoit les nouveaux faits. On y teste un changement de comportement **sans toucher la prod**, on
visualise la trace, puis on **promeut** les faits validés vers la prod — une **release** taguée,
**annulable** d'un geste (les faits rétractés sont archivés, jamais perdus). Voir [Sous-couches](layers).

```
dev : ajouter/ajuster des faits → exécuter → vérifier la trace
   └ promouvoir (release) → prod      ·      annuler la release → retour à l'état précédent
```

> **Un flux est gérable comme une unité.** On peut promouvoir ou annuler **un flux précis**
> (`promoteFlow`) ou en supprimer un entier (`deleteFlow`) — pas seulement toute la surcouche : les
> faits d'un flux se groupent en compagnons de `flow:<nom>`.

## Faire évoluer l'app par un prompt — en sûreté

Le flux étant des **faits**, on peut le faire **écrire par un LLM** à partir d'une demande en langage
naturel — à condition de garder le LLM **auteur**, jamais exécuteur, et de **valider** avant la prod.

```ts
import { FlowAuthor, promoteFlowIfValid, formatFlowIssues } from '@damba/libxn';

const ALLOWED = ['log', 'email'];   // ce que le LLM a le droit d'invoquer (allowlist d'outils)

// 1) Le LLM PROPOSE des faits (port LlmPort : Claude via backend, ou un mock en test).
const author = new FlowAuthor(monLLM);
const p = await author.propose(
  'quand un client devient premium, envoie-lui un email de bienvenue',
  { prod, tools, allowedTools: ALLOWED },
);

// 2) La VALIDATION a déjà tranché (bien formé ? borné ? outils permis ? liens morts ?).
if (!p.validation.ok) {
  console.error(formatFlowIssues(p.validation));   // refusé — la prod n'est PAS touchée
} else {
  // 3) GATE : promotion seulement si valide (release taguée, annulable).
  await promoteFlowIfValid(p.dev, prod, p.flow!, 'v2', { tools, allowedTools: ALLOWED });
}
```

Les arguments des trois API de ce flux d'authoring sûr.

**`new FlowAuthor(llm)`** — le harnais d'écriture. Un seul argument : `llm`, un **port `LlmPort`** (le
même que PingPong) — un objet exposant `complete(prompt, opts?)`. En prod c'est Claude via le backend ;
en test, un mock. Le noyau ne dépend d'aucun transport.

**`author.propose(demand, opts?)`** — demande des faits au LLM, les écrit en dev, valide. Le premier
argument `demand` est la **demande en langage naturel**. Le second, `opts?`, est optionnel :

| Option | Rôle | Défaut |
|---|---|---|
| `prod` | la couche prod (lecture seule) sous la surcouche dev — pour valider l'**état post-promotion** | `undefined` (dev seul) |
| `tools` | registre d'outils — vérifie que chaque `action` référence un outil **existant** | `undefined` |
| `allowedTools` | itérable des outils **autorisés** dans cet environnement (le LLM ne doit invoquer que ceux-là) | `undefined` (aucune restriction de permission) |
| `flow` | nom de flux attendu ; sinon **déduit** du fait `(?, entry, ?)` | déduit |
| `requireElse` | exiger un `else` sur chaque condition (sinon simple avertissement) | `false` |
| `systemPrompt` | system prompt sur-mesure | `FLOW_AUTHORING_RULES` (les règles du noyau) |

`propose` est `async` et retourne un **`FlowProposal`** : `facts` (les faits RETENUS — prédicat de flot
uniquement — écrits en dev), `rejected` (faits à prédicat **hors-flux**, rejetés par anti-injection),
`flow?` (nom déduit), `validation` (le verdict, un `FlowValidationResult`), `dev` (la surcouche
`LayeredKnowledgeBase` à passer au gate) et `raw` (réponse brute du LLM, pour l'audit).

**`formatFlowIssues(result)`** — rend un `FlowValidationResult` lisible. Un seul argument (le résultat
de validation) ; retourne une **chaîne** multi-lignes (`[error] étape : message`), ou `(aucun problème)`
si tout est vert.

**`promoteFlowIfValid(dev, prod, flow, releaseId, opts?)`** — le **gate** dev→prod. Cinq arguments :

| Argument | Rôle | Défaut |
|---|---|---|
| `dev` | la vue **en couches** (surcouche + prod) — c'est l'état qu'aura prod APRÈS promotion, donc ce qui est validé | — (requis) |
| `prod` | la KB de production, cible de la promotion | — (requis) |
| `flow` | nom du flux à valider puis promouvoir | — (requis) |
| `releaseId` | étiquette de release (provenance `release:<id>`, annulable par `rollbackRelease`) | — (requis) |
| `opts?` | options de validation `ValidateFlowOptions` (voir ci-dessous) — typiquement `{ tools, allowedTools }` | `{}` |

`async`, retourne un **`PromoteFlowResult`** : `promoted` (booléen — promu seulement si valide),
`applied` (nombre de faits écrits en prod, `0` si refusé) et `validation` (le `FlowValidationResult`
complet). Si invalide, **rien** n'est écrit en prod.

> 💡 **`ValidateFlowOptions` — le contrat de sûreté.** Ces options pilotent `validateFlow` (appelé
> sous le capot par `promoteFlowIfValid`, `promoteFlow` et `FlowAuthor.propose`) :
> - `tools?` — un `ToolRegistry` : si fourni, toute `action` doit référencer un outil **enregistré**
>   (sinon erreur `unknown-tool`). Vérifie l'**existence**.
> - `allowedTools?` — un itérable de noms : si fourni, toute `action` hors liste est refusée
>   (`tool-not-allowed`). Vérifie la **permission** — c'est le garde-fou « effets de bord » côté
>   écriture non fiable. Orthogonal à `tools`.
> - `requireElse?` — `boolean` (défaut `false`) : si `true`, une condition sans `else` devient une
>   **erreur** bloquante au lieu d'un avertissement.

Deux invariants rendent cela sûr :

- **Le LLM est auteur, pas exécuteur.** Il produit des faits ; c'est `FlowRunner` qui exécute, de
  façon déterministe et tracée. Le non-déterminisme du LLM est **confiné à l'écriture**, qui est validée.
- **Le LLM est cantonné au flot.** Tout fait dont le prédicat **n'appartient pas** au vocabulaire de
  flot (`entry`, `if`/`then`/`else`, `switch`/`case`/`default`, `for_each`/`body`/`max_iter`,
  `action`/`arg`/`next`) est **rejeté d'emblée** : il n'entre jamais dans l'environnement, ne peut
  donc **pas être promu en production**. Le LLM ne peut pas glisser des faits arbitraires (identité,
  classe, données…) sous couvert d'écrire un flux. Ces faits écartés restent **visibles** : ils sont
  exposés sur `proposal.rejected` et tracés par un avertissement de validation `non-flow-predicate`
  (visibilité, pas un blocage).
- **Aucun fait non sûr n'atteint la prod.** `validateFlow` refuse une boucle **non bornée** (`for_each`
  sans `max_iter` **ou** un cycle de contrôle `goto` ne passant par aucune boucle bornée), un
  **lien mort**, une condition incomplète, ou un **outil interdit** (allowlist par environnement) ;
  le **gate** ne promeut que si tout est vert ; `rollbackRelease` annule une release.

> Limite assumée : le LLM **recombine** des outils existants ; il n'invente pas de capacité nouvelle
> (il faudrait enregistrer un outil). L'app **se reconfigure** par les faits — elle ne se programme
> pas depuis zéro.

## Deux sortes de faits : structure et données

Dans la KB d'une app, deux familles de faits cohabitent :

- **Faits de structure** (le « code ») : `entry`, `if`, `then`, `action`, `arg.`… — la **forme** du
  flux. On les change par **authoring → validation → promotion** (rarement, de façon gardée).
- **Faits de données** (l'état) : `(user, role, admin)`, `(panier, total, 64)`,
  `(app, mode, maintenance)`… — ils changent **en cours de route**, écrits par une **action** (un
  outil peut renvoyer des faits), par un autre flux, ou par l'utilisateur. Les conditions les **lisent**
  à l'exécution.

→ Un flux **structurel stable** lit un **état dynamique** : ajouter ou retirer un fait de **données**
reconfigure le comportement **sans toucher au flux**.

**L'ordre d'insertion** ne compte qu'à deux endroits précis (ailleurs, l'adressage par contenu le rend
indifférent) :

1. **Un prédicat de contrôle ne doit porter qu'UNE valeur.** `FlowRunner` prend la **première**
   (`ask(s,p)[0]`). Pour **changer** une branche (`then`, `next`, `entry`…), il faut `retract` l'ancien
   fait **puis** `tell` le nouveau — un simple `tell` ajoute une 2ᵉ valeur, et le **premier inséré gagne**.
2. **L'ordre d'une boucle** = l'ordre d'insertion de la collection : `for_each "panier article"` itère
   les articles dans l'ordre où ils ont été ajoutés.

## Exemple : une app Express qui se reconfigure à chaud

Le squelette Express est déployé **une seule fois**. Le comportement des routes vit dans des **faits** ;
on le change en ajoutant/modifiant des faits — **sans redémarrer ni redéployer**.

```ts
import express from 'express';
import {
  XNeuroneGrid, KnowledgeBase, LayeredKnowledgeBase,
  FlowRunner, ToolRegistry, promoteFlowIfValid,
} from '@damba/libxn';

// ── 1. Le SQUELETTE — déployé UNE seule fois ──────────────────────────────
const prod = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const ALLOWED = ['json', 'status'];   // outils que la reconfiguration peut invoquer

// Outils liés à LA réponse de la requête courante (un registre par requête → sûr en concurrence).
function toolsFor(res: express.Response) {
  return new ToolRegistry()
    .register({ name: 'json',   description: 'Répond en JSON', run: async (i) => { res.json(JSON.parse(String(i['body'] ?? '{}'))); return { text: 'ok' }; } })
    .register({ name: 'status', description: 'Code HTTP',      run: async (i) => { res.status(Number(i['code'])); return { text: '' }; } });
}

// Comportement INITIAL de GET /home — posé en FAITS, pas en code Express :
await prod.tell('GET /home', 'entry', 'gate');
await prod.tell('gate', 'if', 'app mode maintenance');           // condition = fait de DONNÉES
await prod.tell('gate', 'then', 'maint'); await prod.tell('gate', 'else', 'welcome');
await prod.tell('maint', 'action', 'status'); await prod.tell('maint', 'arg.code', '503'); await prod.tell('maint', 'next', 'maintMsg');
await prod.tell('maintMsg', 'action', 'json'); await prod.tell('maintMsg', 'arg.body', '{"error":"maintenance"}');
await prod.tell('welcome', 'action', 'json'); await prod.tell('welcome', 'arg.body', '{"message":"Bienvenue"}');

const app = express();
app.use(express.json());

// ── 2. UNE route générique : elle EXÉCUTE le flux nommé d'après la requête ──
app.all('*', async (req, res) => {
  const flow = `${req.method} ${req.path}`;                       // ex. "GET /home"
  if (prod.ask(flow, 'entry').length === 0) { res.status(404).json({ error: 'route inconnue' }); return; }
  await new FlowRunner(prod, toolsFor(res)).run(flow);           // le comportement vient des FAITS
});

// ── 3a. Basculer un fait de DONNÉES (aucune structure modifiée) ───────────
app.post('/admin/maintenance/:on', async (req, res) => {
  if (req.params.on === 'true') { await prod.tell('app', 'mode', 'maintenance'); }
  else { prod.retract('app', 'mode', 'maintenance'); }
  res.json({ ok: true });   // le prochain GET /home change de comportement, sans redéploiement
});

// ── 3b. Ajouter / changer une STRUCTURE, validée puis promue ──────────────
app.post('/admin/facts', async (req, res) => {
  const facts: [string, string, string][] = req.body.facts;      // (ou un prompt → FlowAuthor)
  const overlay = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
  const dev = new LayeredKnowledgeBase(overlay, [prod]);
  for (const [s, p, o] of facts) { await dev.tell(s, p, o, { kind: 'user' }); }
  const flow = facts.find(([, p]) => p === 'entry')?.[0] ?? req.body.flow;
  const r = await promoteFlowIfValid(dev, prod, flow, `rel-${Date.now()}`, { tools: toolsFor(res), allowedTools: ALLOWED });
  res.json({ promoted: r.promoted, errors: r.validation.errors });  // refusé si invalide → prod intacte
});

app.listen(3000);
```

Cet exemple réutilise les API déjà vues, avec deux détails d'argument à noter :

- **`dev.tell(s, p, o, { kind: 'user' })`** — le **4ᵉ** argument de `tell` est la **`source`** (provenance).
  `{ kind: 'user' }` marque ces faits comme **saisis par un humain** ; les valeurs de `kind` courantes
  sont `user`, `import`, `inference`, `tool` (cf. `promoteFacts` qui pose `{ kind: 'import', ref: 'release:…' }`).
  La provenance n'est pas qu'informative : c'est elle qui permet à `rollbackRelease` de retrouver les
  faits d'une release.
- **`promoteFlowIfValid(dev, prod, flow, releaseId, opts)`** est ici appelé avec un `releaseId`
  **dynamique** (`rel-${Date.now()}`) — chaque promotion est une release distincte, donc annulable
  individuellement. `opts` passe `{ tools: toolsFor(res), allowedTools: ALLOWED }` : l'allowlist
  `ALLOWED` est la **liste blanche par environnement** (ici `['json', 'status']`), pas la liste de tous
  les outils existants.

**Reconfiguration à chaud, sans redéployer** :

| Action | Effet immédiat | Concept |
|--------|----------------|---------|
| `GET /home` | `{"message":"Bienvenue"}` (branche `else`) | exécution depuis les faits |
| `POST /admin/maintenance/true` | le prochain `GET /home` → `503 {"error":"maintenance"}` | **fait de données** ajouté en cours de route |
| `POST /admin/facts` (faits d'une nouvelle route `GET /ping`) | `GET /ping` répond aussitôt | **structure** ajoutée, validée + promue |
| Re-pointer une branche existante | `retract` l'ancien `then`/`next` **puis** `tell` le nouveau | l'ordre/`retract` |

Express n'a **jamais redémarré**. Le code source de l'app n'a **pas changé** : seul son **comportement
en faits** a évolué, sous validation et gate.

## Le contexte d'exécution : `$event` et `$item`

Un flux est écrit **une fois**, sans savoir sur quel sujet il tournera. Deux jetons portent ce
manque : `$event` est **le sujet dont il est question à cet appel**, `$item` est l'élément courant
d'une boucle. Ils sont remplacés au moment de l'exécution, dans les **arguments** comme dans les
**expressions de contrôle** — une condition `if "$event telephone"` teste donc le sujet en cours, et
la trace affiche l'expression **résolue**, pas le gabarit.

```
dossier_incomplet entry di_test
di_test if "$event telephone"
di_test then di_ok
di_test else di_manque
di_manque action tell
di_manque arg.s "$event"
di_manque arg.p needs_field
di_manque arg.o telephone
```

Le même flux vaut pour toutes les fiches : sans ces jetons, il en faudrait un par sujet. Le contexte
est **propre à l'appel** (`runner.run(flow, { context: { event: id } })`), donc deux exécutions
concurrentes ne se marchent pas dessus.

## Armer un flux : les déclencheurs

Un flux peut être lancé à la demande, mais son intérêt vient de l'**armement** : un fait le désigne
comme réagissant à quelque chose. Quatre déclencheurs, volontairement distincts.

| Fait | Sens | `$event` vaut alors |
|---|---|---|
| `<flux> on <prédicat>` | réagit à l'écriture d'un fait portant ce prédicat | le **sujet** du fait écrit |
| `<flux> on_form <formulaire>` | réagit à une **réponse** reçue par ce formulaire | la **fiche** que la réponse vient de créer |
| `<flux> on_document <nom>` \| `any` | réagit à l'**ingestion** d'un document | le **document** ingéré |
| `<flux> every day` \| `week` \| `month` | réagit à une **échéance** | rien (aucun sujet en contexte) |
| `<flux> on_change <information>` | la valeur **change** (≠ elle arrive) | le **sujet** dont la valeur a changé |
| `<flux> on_cross "<information> > <n>"` | la valeur **franchit** un seuil | le **sujet** concerné |
| `<flux> on_retract <information>` | l'information est **retirée** | le **sujet** concerné |
| `<flux> on_contradiction <information>` | deux valeurs **incompatibles** coexistent | le **sujet** concerné |

Les quatre derniers portent sur une TRANSITION, pas sur une arrivée. Rien n'est ajouté au stockage
pour les détecter : l'historique daté et la rétractation-archive suffisent, et la comparaison se fait
au moment de l'écriture, là où l'information passe déjà — le coût suit ce qu'on écrit, pas la taille
de la mémoire. Deux définitions sont volontairement étroites : une information qui **apparaît** n'est
pas un changement (c'est `on`), et un seuil ne se franchit qu'une fois tant que la valeur reste du
même côté, sans quoi une alerte se répéterait jusqu'à ne plus être lue.

⚠️ `on_contradiction` et non `on_conflict` : ce dernier existe déjà avec un tout autre sens, la
politique d'unicité d'un prédicat. Deux sens pour un même prédicat finissent par se croiser.

Un flux déclenché par un document a besoin de savoir ce que ce document contient : les faits extraits
portent sur ses **sujets** (une personne, une somme), jamais sur le document lui-même. Un index
minuscule est donc écrit à l'ingestion — quels types d'information la section a produits, et combien
— ce qui suffit à trier, router ou **réclamer ce qui manque** avec la grammaire de conditions
existante, sans outil supplémentaire. Cet index accompagne la section en cascade : il ne peut pas
survivre à ce qu'il décrit.

La séparation est un choix, pas un manque : une réponse de formulaire écrit N faits d'un coup, et
laisser cette rafale réveiller des flux armés par prédicat rendrait imprévisible ce qui part en
remplissant un formulaire. Ce qui est attaché à un formulaire est donc **exactement** ce qui
s'exécutera.

Ces prédicats d'armement sont **protégés à l'écriture** au même titre que le vocabulaire de flot de
contrôle : un flux ne peut ni s'armer lui-même, ni armer un voisin. C'est la forme d'escalade la plus
durable — s'accorder des occasions de tourner que personne n'a données — donc elle passe par l'humain.

⚠️ **Où vit le flux compte.** Une réponse publique est traitée là où les faits sont écrits, c'est-à-dire
côté serveur. Un flux qui doit réagir à un formulaire public doit donc résider dans une mémoire que
le serveur lit (l'anneau du propriétaire), pas dans une couche locale à une conversation.

## Produire un livrable auditable

L'outil `report` rend un document — tableur ou texte — dont **chaque ligne porte son origine et sa
date**. C'est la chose qu'un moteur d'automatisation générique ne peut pas fabriquer : il ne sait pas
d'où viennent ses chiffres. Ici la provenance est déjà là, il ne restait qu'à la rendre.

La sélection se fait par classe, par informations retenues, par période. Le document dit combien de
lignes il montre sur combien, s'il a été plafonné, combien d'informations ont été écartées faute de
date, et qu'il a été produit automatiquement. Les faits **secrets n'y figurent jamais** : la lecture
qui l'alimente ne les voit pas, plutôt que de les filtrer après coup.

L'outil est **pur** : il lit et met en forme, il ne décide de rien et ne fait rien sortir. Ce qu'on
fait du document appartient à l'étape suivante, donc aux permissions de cette étape-là — d'où le
rapport mensuel qui part tout seul (échéance, puis `report`, puis envoi) sans que la production du
document ait eu besoin d'une permission de sortie.

## Proposer une règle plutôt qu'un fait

Un flux qui écrit cent fois la même déduction fait cent fois le travail d'une phrase. L'action
`suggest_rule` lui permet de le faire remarquer : elle dépose une **candidate**, jamais une règle
active, avec le flux qui la propose et le nombre de cas qui l'appuient. Un humain adopte, ou écarte.

La distinction est structurelle et non prudentielle : un fait affirme quelque chose sur un sujet, sa
portée est bornée ; une règle quantifie sur tout, présent et futur, et change le comportement de la
mémoire entière. Son rayon d'action est inconnu au moment où on l'écrit — c'est ce qui justifie
qu'une personne tranche. L'outil n'écrit que des faits ordinaires, il n'a aucun accès au moteur de
règles : l'impossibilité d'activer ne repose sur aucune promesse.

Une proposition qui ne serait jamais adoptable est refusée au dépôt, avec sa raison, et deux flux qui
remarquent la même chose additionnent leurs soutiens au lieu de créer deux entrées.

## Les garanties

- **Déterministe** : à mémoire et outils donnés, le même flux donne toujours la même trace.
- **Bornée** : budget de pas global + `max_iter` par boucle → **arrêt garanti**, même sur un cycle.
  Une expression de condition ou de boucle mal formée, ou un plafond non numérique, ne fait **pas
  planter** l'exécuteur : il retombe sur une borne sûre et l'arrêt reste garanti.
- **Tracée & explicable** : chaque pas porte son déclencheur ; aucune décision opaque.
- **0 token** pour les conditions : elles sont de simples lectures de la mémoire.

## Quand l'utiliser

| Situation | Mode conseillé |
|-----------|----------------|
| Propriétés, classes, attributs (« qui est quoi ») | déduction symbolique classique |
| « Pourquoi », « qu'est-ce qui a mené à », « dans quel ordre » | Plot Reasoning |
| Raisonnement ouvert validé pas à pas | PingPong |
| **Comportement applicatif modifiable à chaud, testé en dev puis promu en prod** | **Factflow** |
