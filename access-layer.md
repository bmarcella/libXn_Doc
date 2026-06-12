# Couche d'accès — identité, secrets, transactions

Une feature de QPath pour les développeurs : modéliser **identité, confidentialité, contrôle
d'accès et transactions** directement dans les faits. Tout suit l'architecture par **ports** —
QPath fournit la sémantique et les interfaces ; le développeur **injecte la crypto et les
garanties**. Le noyau ne code en dur aucun mot de passe, ne stocke jamais de secret en clair.

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

**Exemple 1 — verrou après 5 échecs de connexion** (fabrique fournie `lockoutGuard`) :

```ts
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 }));
await vault.login('alice', 'mauvais'); // …×5 → chaque échec est un fait systématique
await vault.login('alice', 'bon');     // reason: 'denied' — même le bon mot de passe est refusé
```

**Exemple 2 — au plus 5 dépôts par jour** (`rateLimitGuard`, sur une action métier) :

```ts
const DAY = 24 * 3600_000;
vault.addGuard(rateLimitGuard({ action: 'depot', successOutcome: 'fait', max: 5, windowMs: DAY }));

// avant chaque dépôt :
if (!vault.authorize('alice', 'depot').allow) throw new Error('quota quotidien atteint');
await ledger.deposit('alice', 100);
await vault.record('alice', 'depot', 'fait'); // pour que la garde le compte
```

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

> Une garde peut tout interroger via `ctx.kb` (faits, rôles, soldes via le ledger…) et
> `ctx.count(action, outcome, windowMs)` (les faits systématiques). Les protections sont donc
> **illimitées** : tu en écris autant que ton domaine en demande.

## `TransactionLedger` — faits transactionnels

Un compte / portefeuille modélisé en grand livre **append-only** : chaque mouvement est un fait
**immuable** horodaté ; le **solde n'est jamais stocké**, il est calculé par repli. Le ledger
applique des **contraintes par compte** et sait faire des **virements**.

### Ouvrir un compte (solde initial, plancher, plafond, vélocité)

```ts
const ledger = new TransactionLedger(kb, { currency: 'USD' });

await ledger.open('12345_c', {
  initialBalance: 5000,   // dotation d'ouverture
  floor: -4000,           // découvert autorisé jusqu'à -4000
  ceiling: 1_000_000,     // solde positif maximum
  limits: [               // vélocité : autant de limites que voulu
    { windowMs: 60_000,     kind: 'depot',   maxAmount: 2000 }, // ≤ 2000 déposés / minute
    { windowMs: 86_400_000, kind: 'retrait', maxCount: 3 },     // ≤ 3 retraits / jour
  ],
});
```

`windowMs` est libre : 60 000 (minute), 3 600 000 (heure), 86 400 000 (jour), ×7 (semaine), etc.
Une limite borne le **montant** (`maxAmount`) et/ou le **nombre** (`maxCount`) de mouvements d'un
sens dans la fenêtre. On en empile autant que le domaine l'exige.

### Dépôts, retraits, virements

```ts
await ledger.deposit('12345_c', 1000);
const r = await ledger.withdraw('12345_c', 200);
//  r.ok / r.reason : 'below-floor' | 'above-ceiling' | 'velocity-exceeded' | 'bad-amount'

// Virement ATOMIQUE : prévalidé des deux côtés AVANT toute écriture (rien si l'un refuse).
const v = await ledger.transfer('12345_c', '67890_c', 300, 'loyer');
//  v.ok / v.reason / v.side ('from' | 'to') / v.fromBalance / v.toBalance

ledger.balance('12345_c');    // calculé par repli, jamais écrit
ledger.movements('12345_c');  // l'historique EST la vérité
```

> **Limite de garantie.** Le ledger fournit la SÉMANTIQUE (immuabilité, solde, plancher/plafond,
> vélocité, prévalidation du virement). La **consistance forte** (ACID, concurrence, atomicité
> réelle d'un virement sous crash) reste du ressort de l'hôte : pour de la valeur réelle, adosser
> ce modèle à un système de référence transactionnel. QPath modélise le grand livre ; il ne
> remplace pas un cœur bancaire.


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
const ledger = new TransactionLedger(kb, { currency: 'USD' });

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
