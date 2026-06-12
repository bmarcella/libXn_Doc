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

### `FactGuard` — politiques d'accès

Une garde **lit les faits systématiques** pour appliquer une règle d'accès. Verrou après N
échecs dans une fenêtre :

```ts
vault.addGuard({ principal: 'alice', lockAfterFailures: 5, windowMs: 15 * 60_000 });
await vault.login('alice', 'mauvais'); // …×5
vault.isLocked('alice'); // true — même le bon mot de passe est refusé jusqu'à expiration
```

## `TransactionLedger` — faits transactionnels

Un compte / portefeuille modélisé en grand livre **append-only** : chaque mouvement est un fait
**immuable** horodaté ; le **solde n'est jamais stocké**, il est calculé par repli des
mouvements ; un retrait qui rendrait le solde négatif est **refusé** (invariant configurable).

```ts
const ledger = new TransactionLedger(kb, { currency: 'HTG' });
await ledger.open('12345_c');
await ledger.deposit('12345_c', 1000);
await ledger.withdraw('12345_c', 1000);
ledger.balance('12345_c');    // calculé, jamais écrit
ledger.movements('12345_c');  // l'historique EST la vérité
```

> **Limite de garantie.** Le ledger fournit la SÉMANTIQUE (immuabilité, calcul du solde,
> invariant non négatif). La **consistance forte** (ACID, concurrence) reste du ressort de
> l'hôte : pour de la valeur réelle, adosser ce modèle à un système de référence transactionnel.
> QPath modélise le grand livre ; il ne remplace pas un cœur bancaire.

## Exemple complet — coffre personnel + portefeuille

**Le problème.** Une app où chaque utilisateur a (a) un mot de passe, (b) un secret à protéger
(clé API, note privée), (c) un portefeuille. On veut : inscription, connexion résistante au
brute-force, secret invisible tant qu'on n'est pas connecté, et un solde qui ne se corrompt
jamais. Le tout modélisé dans les faits QPath — la crypto branchée par ports.

```ts
import {
  KnowledgeBase, XNeuroneGrid, FactVault, TransactionLedger,
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
vault.addGuard({ principal: 'bigvai@mail.com', lockAfterFailures: 5, windowMs: 15 * 60_000 });

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
vault.auditTrail('bigvai@mail.com');                 // [{ outcome:'échec', at }, { outcome:'succès', at }]
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
