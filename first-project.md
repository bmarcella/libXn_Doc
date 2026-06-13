# Premier projet : une banque **conversationnelle** (LibXN + Express)

On construit une banque où l'utilisateur **s'inscrit** (identité + secret via la couche d'accès),
**se connecte**, **ouvre un compte USD**, et fait **tout le reste en discutant** — pas de formulaire.
Il écrit *« ouvre-moi un compte en dollars »*, *« vire 25 $ à Bob »*, *« mon solde ? »*.

## Le principe : le LLM comprend, le déterministe détient la vérité

> 🧠 **Le LLM** traduit le langage en **intention** (comprendre la demande).
> ⚙️ **QPath (déterministe)** exécute et répond : soldes, mouvements, virements. **L'argent n'est
> jamais décidé par le LLM** — il ne fait que router. Un virement refusé (solde insuffisant) le
> reste, quelle que soit la jolie phrase.

## 1. Installer

```bash
npm install express @damba/libxn
```

## 2. Le setup (au démarrage)

Le store, la KB durable, le grand livre, et le coffre d'identité — créés **une fois** au boot.
(En prod, `factStore` = adaptateur Postgres ; cf. [Persistance › Créer un store](/persistence#créer-un-store).)

```ts
import { createHash, randomBytes } from 'crypto';
import {
  DurableKnowledgeBase, FactVault, InMemoryFactStore, TransactionLedger, XNeuroneGrid,
  lockoutGuard, type FactAuthenticator,
} from '@damba/libxn';

const factStore = new InMemoryFactStore();                       // dev ; prod = Postgres
// undefined = encodeur par défaut ; headless = sans rendu (Node/serveur)
const grid = new XNeuroneGrid(undefined, { headless: true });
const bank = new DurableKnowledgeBase(grid, factStore, 'bank');  // UN scope = virements atomiques
await bank.hydrate();

// Le grand livre n'est pas « que de l'argent » : on le nomme et on fixe l'unité par défaut.
const ledger = new TransactionLedger(bank, { name: 'Comptes clients', unit: 'USD' });

// Comment on vérifie un mot de passe = TON hachage (la couche d'accès ne code rien en dur).
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const authenticator: FactAuthenticator = {
  async authenticate(principal, password) {
    const ok = bank.ask(principal, 'password_hash')[0] === sha(password);
    return ok ? { principal, issuedAt: Date.now(), expiresAt: Date.now() + 3_600_000 } : null;
  },
  verify: (s) => !s.expiresAt || s.expiresAt > Date.now(),
};
const vault = new FactVault(bank, { authenticator });
vault.addGuard(lockoutGuard({ action: 'login', maxFailures: 5, windowMs: 15 * 60_000 })); // anti-bruteforce
```

## 3. S'inscrire — identité + secret (couche d'accès)

L'inscription stocke l'**identité** (faits ordinaires), le **hash** du mot de passe (jamais en clair)
et un **secret** chiffré au repos (clé d'API), masqué des lectures normales.

```ts
async function signup(email: string, password: string) {
  const userId = `user:${email}`;
  if (bank.ask(userId, 'password_hash').length) throw new Error('déjà inscrit');

  await bank.tell(userId, 'email', email);                 // identité
  await bank.tell(userId, 'password_hash', sha(password)); // jamais le mot de passe en clair
  await vault.setSecret(userId, 'api_key', randomBytes(16).toString('hex')); // secret chiffré
  await bank.flush();
  return userId;
}
```

## 4. Se connecter

`vault.login` applique les gardes (verrou anti-bruteforce), authentifie, et **émet un fait d'audit
horodaté** (succès/échec) — gratuitement.

```ts
async function login(email: string, password: string) {
  const r = await vault.login(`user:${email}`, password);
  return r.session;   // null si mauvais identifiants ou compte verrouillé
}
```

## 5. Tout le reste — **en chattant**

Le cœur : un message libre → le LLM en extrait une **intention** → le **déterministe** l'exécute.

```ts
const llm = async (prompt: string): Promise<string> => /* appelle TON modèle (Claude, GPT…) */ '';
const money = (cents: number) => (cents / 100).toFixed(2);
const accId = (userId: string, unit: string) => `${userId}:${unit.toLowerCase()}`;

// 1) LE LLM COMPREND : texte → { action, unit?, amount?, to?, ref? }
async function understand(message: string) {
  const prompt = `Convertis cette demande bancaire en JSON, et RIEN d'autre.
Schéma: {"action":"open|deposit|transfer|balance|history|other","unit"?:"usd","amount"?:<centimes>,"to"?:"<compte>","ref"?:"<texte>"}
Demande: "${message}"`;
  return JSON.parse(await llm(prompt)) as {
    action: string; unit?: string; amount?: number; to?: string; ref?: string;
  };
}

// 2) LE DÉTERMINISTE EXÉCUTE — l'argent passe UNIQUEMENT par le ledger validé
async function handle(userId: string, message: string): Promise<string> {
  const i = await understand(message);
  const unit = i.unit ?? 'usd';
  const acc = accId(userId, unit);

  switch (i.action) {
    case 'open':
      await ledger.open(acc, { unit });
      await bank.flush();
      return `Compte ${unit.toUpperCase()} ouvert ✅`;

    case 'deposit': {
      const r = await ledger.deposit(acc, i.amount!, { ref: i.ref });
      await bank.flush();
      return r.ok ? `Dépôt effectué. Solde : ${money(r.balance)} ${unit.toUpperCase()}.` : `Refusé (${r.reason}).`;
    }

    case 'transfer': {
      const r = await ledger.transfer(acc, accId(i.to!, unit), i.amount!, { ref: i.ref });
      await bank.flush();
      return r.ok ? `Virement effectué. Solde : ${money(r.fromBalance)}.` : `Refusé (${r.reason}).`;
    }

    case 'balance':                                   // ← 100 % déterministe, jamais le LLM
      return `Ton solde est de ${money(ledger.balance(acc))} ${unit.toUpperCase()}.`;

    case 'history':                                   // ← vérité, depuis le grand livre
      return ledger.movementsPage(acc, { limit: 5, desc: true })
        .items.map(m => `• ${m.kind} ${money(m.amount)} ${m.ref ? `(${m.ref})` : ''}`).join('\n') || 'Aucun mouvement.';

    default:
      return 'Je peux : ouvrir un compte, déposer, virer, donner ton solde ou ton historique.';
  }
}
```

### L'API Express

```ts
import express from 'express';
const app = express();
app.use(express.json());
const wrap = (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/signup', wrap(async (req, res) =>
  res.status(201).json({ userId: await signup(req.body.email, req.body.password) })));

app.post('/login', wrap(async (req, res) => {
  const session = await login(req.body.email, req.body.password);
  session ? res.json({ token: issueToken(session) }) : res.status(401).json({ error: 'identifiants invalides' });
}));

// Tout passe par le chat — `requireAuth` valide le token et donne req.userId.
app.post('/chat', requireAuth, wrap(async (req, res) =>
  res.json({ reply: await handle(req.userId, req.body.message) })));

app.listen(3000, () => console.log('🏦 Banque conversationnelle → http://localhost:3000'));
```

### Le dialogue

```text
POST /chat  « ouvre-moi un compte en dollars »   → « Compte USD ouvert ✅ »
POST /chat  « dépose 100 dollars »               → « Dépôt effectué. Solde : 100.00 USD. »
POST /chat  « vire 25 dollars à user:bob@x.com » → « Virement effectué. Solde : 75.00. »
POST /chat  « quel est mon solde ? »             → « Ton solde est de 75.00 USD. »
POST /chat  « mes dernières opérations »         → « • withdraw 25.00 … • deposit 100.00 … »
```

## Pourquoi c'est sûr

- Le LLM **ne décide jamais** d'un solde ni d'un virement : il produit une *intention*, point.
- Toute opération d'argent passe par `ledger`, qui **valide** (plancher, plafond, vélocité, statut) et
  qui est **atomique** sur une KB durable. Un refus reste un refus.
- Les réponses factuelles (`balance`, `history`) viennent **directement du grand livre déterministe**
  — zéro hallucination. La même question donne toujours la même réponse vérifiable.

## Bonnes pratiques

1. **Un scope = une frontière transactionnelle** (toute la banque → virements atomiques).
2. **`hydrate()` au démarrage**, **`flush()` après chaque écriture**.
3. **Identité & secrets via la couche d'accès** : hash pour le mot de passe (jamais en clair),
   `setSecret` pour les valeurs réversibles (chiffrées, masquées) ; garde anti-bruteforce.
4. **Le LLM pour comprendre, le déterministe pour exécuter** — l'argent ne dépend jamais du modèle.
5. **Montants en entiers** (centimes).

## Pour aller plus loin

- **Raisonnement déterministe** au-delà du ledger : règles (`RuleEngine`), chaînes (`ChainResolver`),
  questions inverses (« à qui ai-je viré ? ») — tout sans LLM. Voir [Composants](/components).
- **Types & plafonds** : `types` pré-configurés et `limits` de vélocité — voir [Grand livre](/transaction-ledger).
- **Audit** : `vault.auditTrail(principal)` rejoue toutes les connexions (réussies/échouées).
- **Production** : `factStore` = adaptateur connecté à ta base ; tu crées la connexion, LibXN ne voit
  que l'interface — voir [Persistance › Créer un store](/persistence#créer-un-store).
