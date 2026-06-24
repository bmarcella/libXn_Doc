# Couche d'accès — identité, secrets, accès

Une feature de QPath pour les développeurs : modéliser **identité, confidentialité, contrôle
d'accès et transactions** directement dans les faits. Tout suit l'architecture par **ports** —
QPath fournit la sémantique et les interfaces ; le développeur **injecte la crypto et les
garanties**. Le noyau ne code en dur aucun mot de passe, ne stocke jamais de secret en clair.

> Le **[Grand livre transactionnel](transaction-ledger)** (`TransactionLedger`) a sa propre page.

## `FactVault` — faits secrets, authentification, gardes, audit

### Faits secrets (confidentialité)

Un fait secret a sa valeur **chiffrée au repos** (via un `CipherPort` injecté) et est **masqué
des lectures normales** (`allFacts`, RAG, vue admin). Seul un accès authentifié via le Vault le
révèle.

```ts
const vault = new FactVault(kb, { authenticator, cipher });
await vault.setSecret('bigvai#1', 'password', 'hunter2');

kb.allFacts();                        // le fait n'y apparaît pas
vault.read('bigvai#1', 'password');   // [] sans session
vault.read('bigvai#1', 'password', session); // ['hunter2'] avec session valide
```

**`new FactVault(kb, opts)`** — deux arguments :

- `kb` : la `KnowledgeBase` (ou `DurableKnowledgeBase`) où vivent les faits. Le coffre ne stocke rien à côté : un secret est un fait normal portant le drapeau `secret`.
- `opts` : un objet d'options, **tous les champs facultatifs** :

| Champ | Rôle | Défaut |
|---|---|---|
| `authenticator` | le port `FactAuthenticator` qui **vérifie** les sessions (ta crypto : Argon2id, JWT…). Sans lui, le coffre est **fail-closed** (aucune révélation) | `undefined` |
| `cipher` | le port `CipherPort` qui chiffre/déchiffre les valeurs au repos | `PlaintextCipher` — **non sécurisé**, à remplacer en prod |
| `now` | horloge injectable (`() => number`), utile pour les tests déterministes (fenêtres de gardes) | `() => Date.now()` |
| `insecureAllowUnauthenticated` | DEV/TEST seulement : révèle les secrets sur n'importe quelle session, **sans** authenticator | `false` |

**`vault.setSecret(s, p, plainO, source?)`** → `Promise<void>`. Écrit le triplet `(s, p, plainO)` avec la valeur **chiffrée au repos** et le drapeau `secret`. Le 4ᵉ argument `source` (provenance) est optionnel ; par défaut `{ kind: 'user', ref: 'vault' }`.

**`vault.read(s, p, session?)`** → **`string[]`** (jamais `null`). Renvoie les valeurs du fait :
- `session` absente ou invalide → les valeurs `secret` sont **omises** (tableau vide si le fait n'a que des secrets).
- `session` valide (vérifiée par l'`authenticator`) → les secrets sont **déchiffrés** et inclus.

> 💡 La forme `string[]` est la même que `kb.ask` : un sujet+prédicat peut avoir plusieurs valeurs. Pour un secret unique, lis `vault.read(...)[0]`.

> **Fail-closed par défaut.** Sans `authenticator` injecté, le Vault **refuse** toute révélation —
> une `Session` est un simple objet non signé, l'accepter sans vérification serait *fail-open*. Pour
> un bac à sable de dev, l'option explicite `insecureAllowUnauthenticated: true` lève la garde (à ne
> **jamais** activer en production).

### Authentification (port)

`FactAuthenticator` est le contrat que tu implémentes avec **ta** crypto (Argon2id, JWT…) :

```ts
interface FactAuthenticator {
  authenticate(principal, credential): Promise<Session | null>;
  verify(session): boolean;
}
```

### Faits systématiques (audit)

Chaque `vault.login()` **émet un fait horodaté** `(audit:<principal>, tentative, succès|échec|verrou)`.
La couche d'accès raconte sa propre activité **en faits** — auto-référentiel, 100 % QPath.

### `FactGuard` — politiques d'accès GÉNÉRIQUES

Une garde n'est **pas** un verrou de login : c'est une **politique** qui raisonne sur les faits
(surtout les faits systématiques d'audit) pour **autoriser ou refuser n'importe quelle action**.
Le verrouillage de compte n'est qu'un exemple parmi une infinité — quota, horaires, plafond,
géo, rôle, séquence… Toutes passent par la même interface :

```ts
interface FactGuard {
  name: string;
  actions?: string[];                 // actions gardées (défaut : toutes)
  check(ctx: GuardContext): { allow: boolean; reason?: string };
}
```

`vault.authorize(principal, action)` est **le** point d'entrée du contrôle d'accès — pour le
login, un dépôt, une lecture, ou tout verbe métier. Il passe les gardes applicables ; la
première qui refuse l'emporte. Les actions s'enregistrent en faits systématiques via
`vault.record(principal, action, outcome)`, sur lesquels les gardes comptent.

**`vault.authorize(principal, action)`** → **`{ allow: boolean; reason?: string }`** (synchrone) :
- `principal` : le sujet concerné (utilisateur, compte…).
- `action` : le verbe tenté (`'login'`, `'deposit'`, `'read'`…). Seules les gardes dont `actions` contient cette valeur (ou qui n'ont **pas** de `actions`, donc « toutes ») sont consultées.
- Retour : `{ allow: true }` si aucune garde ne refuse ; sinon `{ allow: false, reason }` de la **première** garde qui refuse.

**`vault.record(principal, action, outcome, at?)`** → `Promise<void>`. Émet un fait systématique horodaté `(audit:<principal>, action, outcome)`.

| Argument | Rôle | Défaut |
|---|---|---|
| `principal` | sujet de l'audit | — (requis) |
| `action` | verbe enregistré (doit correspondre à ce que les gardes comptent) | — (requis) |
| `outcome` | résultat libre (`'fait'`, `'échec'`, `'succès'`…) — c'est lui que comptent `lockoutGuard`/`rateLimitGuard` | — (requis) |
| `at` | horodatage (ms) du fait | `now()` (l'horloge du coffre) |

> ⚠️ L'`outcome` que tu passes à `record(...)` doit être **exactement** celui que la garde attend : `lockoutGuard` compte par défaut `'échec'`, `rateLimitGuard` compte `'fait'`. Un libellé différent = la garde ne voit rien.

**Exemple 1 — verrou après 5 échecs de connexion** (fabrique fournie `lockoutGuard`) :

```ts
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 }));
await vault.login('alice', 'mauvais'); // …×5 → chaque échec est un fait systématique
await vault.login('alice', 'bon');     // reason: 'denied' — même le bon mot de passe est refusé
```

**`lockoutGuard(opts)`** → un `FactGuard` prêt à passer à `addGuard`. Champs de `opts` :

| Champ | Rôle | Défaut |
|---|---|---|
| `action` | l'action gardée (et comptée), ex. `'login'` | — (requis) |
| `maxFailures` | nombre d'échecs dans la fenêtre qui déclenche le verrou | — (requis) |
| `windowMs` | largeur de la fenêtre glissante, en millisecondes | — (requis) |
| `failureOutcome` | le libellé d'`outcome` compté comme un échec | `'échec'` |
| `name` | nom de la garde (trace/audit) | `'lockout:<action>'` |

**`vault.login(principal, credential)`** → **`Promise<LoginResult>`**, où `LoginResult = { session: Session | null; reason: 'bad-credential' | 'denied' | null; guardReason?: string }`. `reason` vaut `null` en cas de succès, `'denied'` si une garde a bloqué (avec `guardReason`), `'bad-credential'` si l'authentification a échoué. Nécessite un `authenticator` injecté (sinon lève).

**Exemple 2 — au plus 5 dépôts par jour** (`rateLimitGuard`, sur une action métier) :

```ts
const DAY = 24 * 3600_000;
vault.addGuard(rateLimitGuard({ action: 'deposit', successOutcome: 'fait', max: 5, windowMs: DAY }));

// avant chaque dépôt :
if (!vault.authorize('alice', 'deposit').allow) throw new Error('quota quotidien atteint');
await ledger.deposit('alice', 100);
await vault.record('alice', 'deposit', 'fait'); // pour que la garde le compte
```

**`rateLimitGuard(opts)`** → un `FactGuard`. Même esprit que `lockoutGuard`, mais compte les **réussites** :

| Champ | Rôle | Défaut |
|---|---|---|
| `action` | l'action gardée (et comptée), ex. `'deposit'` | — (requis) |
| `max` | nombre maximum d'actions réussies tolérées dans la fenêtre | — (requis) |
| `windowMs` | largeur de la fenêtre glissante, en millisecondes | — (requis) |
| `successOutcome` | le libellé d'`outcome` compté comme une réussite | `'fait'` |
| `name` | nom de la garde (trace/audit) | `'rate:<action>'` |

> ⚠️ `rateLimitGuard` ne **compte** que ce que tu enregistres : c'est à toi d'appeler `vault.record(principal, action, successOutcome)` **après** chaque action réussie (cf. la ligne `vault.record('alice', 'deposit', 'fait')`). La garde ne s'incrémente pas toute seule.

**Exemple 3 — garde sur mesure (heures ouvrées)** : n'importe quelle logique, en quelques lignes :

```ts
vault.addGuard({
  name: 'heures-ouvrées',
  actions: ['read'],
  check: (ctx) => {
    const h = new Date(ctx.now).getHours();
    return h >= 9 && h < 17 ? { allow: true } : { allow: false, reason: 'hors heures ouvrées' };
  },
});
```

**`vault.addGuard(guard)`** → `void`. Le `guard` est un objet `FactGuard` :

| Champ | Rôle | Défaut |
|---|---|---|
| `name` | identifiant de la garde (trace/audit) | — (requis) |
| `actions` | tableau des actions gardées ; une garde sans `actions` s'applique à **toutes** les actions | `undefined` (= toutes) |
| `check(ctx)` | la décision : renvoie `{ allow: boolean; reason?: string }` | — (requis) |

Le `ctx` (`GuardContext`) reçu par `check` contient : `kb` (la base), `principal`, `action`, `now` (timestamp ms), et `count(action, outcome, windowMs)` pour compter les faits systématiques.

> Une garde peut tout interroger via `ctx.kb` (faits, rôles, soldes via le ledger…) et
> `ctx.count(action, outcome, windowMs)` (les faits systématiques). Les protections sont donc
> **illimitées** : tu en écris autant que ton domaine en demande.

## `FactAccessControl` — groupes d'accès & permissions (RBAC)

Pour une **organisation** : grouper les faits sous des **groupes d'accès**, définir des
permissions **CRUD** (read / write / update / delete), et **accorder ou révoquer** l'accès par
membre. Qui peut voir quoi, qui peut modifier quoi — à la granularité du groupe.

Le principe 100 % QPath : **les permissions sont elles-mêmes des faits**. Accorder, c'est écrire
un fait ; révoquer, c'est le rétracter (archivé — l'historique des accès est complet et
auditable). Les droits héritent donc de tout QPath : traçables, **superposables** (un droit posé
au niveau org couvre toutes les conversations via la pile de portées) et interrogeables.

```ts
const acl = new FactAccessControl(kb, { requireDeclaredGroups: true });

// 0) DÉCLARER les groupes en amont (entités de 1re classe, existent même vides)
await acl.declareGroup('finances', { description: 'Données financières' });
acl.declaredGroups();   // [{ name:'finances', description:'…', factCount:0, declared:true }]

// 1) Grouper des faits — en UN appel (écrit + rattache, retourne l'id du fait)
const id = await acl.tellInGroup('budget', 'montant', '50000', 'finances');
//  → id === kb.factId('budget','montant','50000')  (l'id est DÉTERMINISTE : hash du triplet,
//    pas un id généré — donc kb.tell n'a pas à le « renvoyer », il se calcule à tout moment)

// (équivalent en deux temps : kb.tell(...) puis acl.assign(...) — mais NON atomique : sur une base
//  durable, une fenêtre existe où le fait est écrit SANS son groupe. `tellInGroup` pose le drapeau
//  `group` dans la même écriture → préférable pour un fait censé être restreint.)

// 2) Accorder / révoquer (chaque droit est un fait)
await acl.grant('alice', 'finances', 'read', 'write');  // alice : lecture + écriture
await acl.grant('admin', 'finances');                   // toutes les permissions
acl.revoke('alice', 'finances', 'write');               // archivé, pas effacé

// 3) Vérifier & introspecter
acl.can('alice', 'finances', 'read');                   // true
acl.permissionsOf('alice', 'finances');                 // ['read']
acl.membersWithAccess('finances', 'write');             // ['admin']  — qui peut écrire ?
acl.groupsAccessibleBy('alice', 'read');                // ['finances']

// 4) Rechercher des faits par groupe
acl.factsInGroup('finances');                  // tous les faits du groupe
acl.searchInGroup('finances', 'budget');       // recherche plein-texte dans le groupe
acl.factsAccessibleBy('alice', 'read');        // tous les faits qu'alice peut lire (tous groupes)

// 5) Opérations gouvernées (CRUD vérifié)
const { result, facts } = acl.read('bob', 'finances');  // result.allowed=false (bob non autorisé)
await acl.write('admin', 'finances', 'prime', 'vaut', '1000');     // ok → fait tagué « finances »
await acl.update('admin', 'finances', 'prime', 'vaut', '1000', '1200');
acl.remove('admin', 'finances', 'prime', 'vaut', '1200');          // rétracté (archivé)
```

**`new FactAccessControl(kb, opts?)`** — deux arguments :
- `kb` : la `KnowledgeBase` où vivent faits et droits (les permissions sont elles-mêmes des faits).
- `opts` : facultatif. Seul champ : `requireDeclaredGroups` (booléen, défaut `false`). À `true`, rattacher un fait à un groupe **non déclaré** est refusé — `assign`/`tellInGroup` retournent alors un échec tant que le groupe n'a pas été créé via `declareGroup`.

Les méthodes utilisées ci-dessus, argument par argument :

| Appel | Arguments | Retour |
|---|---|---|
| `declareGroup(name, info?)` | `name` (requis) ; `info?` = `{ description? }` (la description préserve casse/accents à l'affichage) | `Promise<string>` (le nom normalisé) |
| `declaredGroups()` | aucun | `GroupInfo[]` = `{ name, description?, factCount, declared }[]`, trié par nom |
| `tellInGroup(s, p, o, group, source?)` | triplet `s/p/o` + `group` ; `source?` = provenance (défaut `{ kind:'user', ref:'acl:group:<group>' }`) | `Promise<string>` — l'**id déterministe** du fait (`kb.factId(s,p,o)`) |
| `grant(member, group, ...perms)` | `member`, `group`, puis 0..N permissions ; **aucune perm = TOUTES** (`read/write/update/delete`) | `Promise<void>` |
| `revoke(member, group, perm?)` | `perm?` omis = révoque **toutes** les permissions ; archivé, pas effacé | `void` |
| `can(member, group, perm)` | les trois requis | `boolean` |
| `permissionsOf(member, group)` | les deux requis | `Permission[]` |
| `membersWithAccess(group, perm?)` | `perm?` défaut `'read'` | `string[]` (membres) |
| `groupsAccessibleBy(member, perm?)` | `perm?` défaut `'read'` | `string[]` (groupes) |
| `factsInGroup(group)` | `group` requis | `EnumeratedFact[]` (secrets inclus, chiffrés) |
| `searchInGroup(group, query)` | recherche plein-texte s/p/o dans le groupe | `EnumeratedFact[]` |
| `factsAccessibleBy(member, perm?)` | `perm?` défaut `'read'` | `EnumeratedFact[]` (union des groupes autorisés) |

> 💡 **`Permission`** est l'un de `'read' | 'write' | 'update' | 'delete'`. `grant` accepte un nombre variable de permissions ; les passer **toutes** revient à n'en passer **aucune** (`grant('admin', 'finances')`).

Les opérations gouvernées (CRUD vérifié) :

| Appel | Arguments | Retour |
|---|---|---|
| `read(member, group)` | les deux requis | `{ result: AccessResult; facts: EnumeratedFact[] }` — `facts` vide si refusé |
| `write(member, group, s, p, o, source?)` | triplet + `source?` ; écrit puis tague le fait du groupe | `Promise<AccessResult>` |
| `update(member, group, s, p, oldO, newO)` | remplace `oldO` par `newO` (le fait doit déjà appartenir au groupe) | `Promise<AccessResult>` |
| `remove(member, group, s, p, o)` | rétracte (archive) le fait du groupe | `AccessResult` |

Chaque opération `read/write/update/delete` vérifie la permission avant d'agir et renvoie
`AccessResult` = `{ allowed: boolean; missing? }` (`missing` indique la permission absente quand
`allowed` est `false`). Comme les droits sont des faits, un audit complet (« qui a donné l'accès
écriture à finances, et quand ? ») se lit directement dans la provenance et l'historique.

> ⚠️ `update`/`remove` renvoient `{ allowed: false }` (sans `missing`) si le fait visé **n'appartient pas** au groupe indiqué — le contrôle d'appartenance précède le contrôle de permission.


## Exemple complet — coffre personnel + portefeuille

**Le problème.** Une app où chaque utilisateur a (a) un mot de passe, (b) un secret à protéger
(clé API, note privée), (c) un portefeuille. On veut : inscription, connexion résistante au
brute-force, secret invisible tant qu'on n'est pas connecté, et un solde qui ne se corrompt
jamais. Le tout modélisé dans les faits QPath — la crypto branchée par ports.

```ts
import {
  KnowledgeBase, XNeuroneGrid, FactVault, TransactionLedger, lockoutGuard,
  type FactAuthenticator, type CipherPort, type Session,
} from '@damba/libxn';
import {
  scryptSync, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv,
} from 'node:crypto';

// 1) Chiffrement RÉEL des valeurs secrètes (AES-256-GCM). En navigateur : Web Crypto.
class AesCipher implements CipherPort {
  constructor(private key: Buffer) {}                 // 32 octets, gardés HORS du graphe
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
  }
  decrypt(cipher: string): string {
    const [iv, tag, enc] = cipher.split(':').map(h => Buffer.from(h, 'hex'));
    const d = createDecipheriv('aes-256-gcm', this.key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  }
}

// 2) Authentificateur RÉEL : vérifie un hash scrypt stocké en fait (jamais le mot de passe).
class PasswordAuthenticator implements FactAuthenticator {
  constructor(private kb: KnowledgeBase) {}
  async authenticate(principal: string, password: string): Promise<Session | null> {
    const [record] = this.kb.ask(principal, 'pwd');   // "salt:hash"
    if (!record) return null;
    const [salt, hash] = record.split(':');
    const candidate = scryptSync(password, salt, 32).toString('hex');
    const ok = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
    return ok ? { principal, issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 } : null;
  }
  verify(s: Session): boolean { return !s.expiresAt || s.expiresAt > Date.now(); }
}

// ── Mise en place
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
const vault = new FactVault(kb, {
  authenticator: new PasswordAuthenticator(kb),
  cipher: new AesCipher(randomBytes(32)),             // clé hors du graphe
});
const ledger = new TransactionLedger(kb, { unit: 'USD' });

// ── Inscription : on stocke le HASH, jamais le mot de passe ; le secret est chiffré
async function register(principal: string, password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  await kb.tell(principal, 'pwd', `${salt}:${hash}`);
}
await register('bigvai@mail.com', 'hunter2');
await vault.setSecret('bigvai@mail.com', 'cle_api', 'sk-live-xyz');
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 }));

// ── Connexion (résistante au brute-force : 5 échecs → verrou ; chaque essai = fait d'audit)
await vault.login('bigvai@mail.com', 'mauvais');               // échec, tracé
const { session } = await vault.login('bigvai@mail.com', 'hunter2'); // succès

// ── Après connexion : le secret se révèle, le portefeuille s'utilise
vault.read('bigvai@mail.com', 'cle_api');           // []            — sans session
vault.read('bigvai@mail.com', 'cle_api', session!); // ['sk-live-xyz'] — déchiffré
await ledger.open('bigvai@mail.com');
await ledger.deposit('bigvai@mail.com', 250);
await ledger.withdraw('bigvai@mail.com', 100);
ledger.balance('bigvai@mail.com');                   // 150 — calculé par repli, jamais stocké
vault.auditTrail('bigvai@mail.com', 'login');        // [{ action:'login', outcome:'échec', at }, { …'succès' }]
```

**Les constructeurs et appels de la mise en place :**

- **`new XNeuroneGrid(encoder?, opts?)`** — `encoder?` est la fonction qui encode une donnée en paires de bits (défaut : `BinaryConverter.toBinaryPairs`, d'où `undefined`) ; `opts?` = `{ headless? }`, et `{ headless: true }` désactive tout rendu (Node/serveur).
- **`new KnowledgeBase(grid)`** — un seul argument : la grille QPath qui sert de mémoire de travail.
- **`new TransactionLedger(kb, opts?)`** — `kb` requis ; `opts?` accepte notamment `{ unit, name?, description?, types?, now? }`. Détails complets sur la page [Grand livre](transaction-ledger).
- **`vault.auditTrail(principal, action?)`** → tableau d'objets `{ action, outcome, at }` triés par horodatage. `action?` omis = **toutes** les actions du principal.

> 🔒 La clé AES (`randomBytes(32)`, 32 octets) est passée au `CipherPort` et **reste hors du graphe** : QPath ne stocke jamais la clé, seulement la valeur chiffrée. La perte de la clé rend les secrets irrécupérables — c'est voulu.

**Ce que ça résout, concrètement** : le mot de passe n'existe nulle part (seul son hash), le
secret est chiffré et invisible des lectures normales et des admins, le brute-force est bloqué
au 5ᵉ essai et chaque tentative laisse une trace auditable, et le solde se recalcule depuis
l'historique — impossible à désynchroniser. Tout vit dans les faits ; la solidité vient des
ports injectés (AES, scrypt), pas du noyau.


## Le principe de sécurité

- La crypto vit dans des **ports injectés** (`CipherPort`, `FactAuthenticator`) — jamais dans le
  noyau. `PlaintextCipher` (défaut) est explicitement marqué **non sécurisé** : injecter un vrai
  chiffrement en production.
- QPath **modélise et orchestre** ; la solidité réelle (force du hachage, secret du chiffrement,
  persistance, transactions) vient de ce que le développeur branche.
- **Normalisation transparente** : le Vault ré-encode la valeur chiffrée avant de la stocker, donc
  un secret survit intact (casse, symboles, Unicode) quel que soit le `CipherPort` — vous n'avez
  aucune contrainte de format sur la sortie de votre chiffrement.
- **Revérification sûre** : quand un fait est revérifié dans le temps (la réalité a pu changer), la
  vérification **n'écrase jamais** un secret ni une décision **close** — un secret revérifié n'est
  jamais réécrit en clair, et un fait clos n'est pas déclassé. Une réécriture légitime **préserve**
  le drapeau structurant (`major`), pour que l'ossature ontologique reste prioritaire.
- **Durabilité** : construite sur une [`DurableKnowledgeBase`](/persistence#kb-durable-durableknowledgebase),
  toute la couche d'accès (secrets, permissions, audit) est **persistée** dans Postgres et survit au
  redémarrage — sans changer le code. Les faits systématiques deviennent un journal d'audit durable.

> ⚠️ Un fait secret rattaché à un **groupe d'accès** (`FactAccessControl`) est renvoyé par
> `factsInGroup` / `read` sous sa forme **chiffrée** : l'ACL régit l'appartenance au groupe, le
> déchiffrement reste exclusivement du ressort du `FactVault` (lecture authentifiée). Les deux
> couches sont volontairement orthogonales.
