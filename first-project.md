# Premier projet : une API bancaire avec LibXN + Express

On construit une petite **API bancaire** de bout en bout : ouvrir des comptes, déposer, retirer,
faire des **virements atomiques**, lire les soldes et l'historique. Le tout **durable** (survit au
redémarrage) et **transactionnel** (un virement réussit en entier ou pas du tout).

C'est l'occasion de voir les **bonnes pratiques** LibXN sur un cas réel.

## 1. Installer

```bash
npm init -y
npm install express @damba/libxn
```

## 2. Le store (où les faits sont persistés)

`DurableKnowledgeBase` a besoin d'un **store**. En développement, l'implémentation en mémoire du
noyau suffit ; en production, on injecte un adaptateur Postgres (voir [Persistance](/persistence) —
le reste du code ne change pas).

```ts
import { InMemoryFactStore } from '@damba/libxn';

const factStore = new InMemoryFactStore();   // dev/test ; prod = adaptateur Postgres
```

## 3. Le cœur métier : un ledger durable

On réutilise le **`factStore` créé à l'étape 2** (en test, `new InMemoryFactStore()` ; en prod,
l'adaptateur Postgres injecté). C'est lui qui rend toute la banque durable.

```ts
import { DurableKnowledgeBase, TransactionLedger, XNeuroneGrid } from '@damba/libxn';

// 🔑 BONNE PRATIQUE — un SEUL scope pour la banque.
// Tous les comptes vivent dans le même scope « bank », donc un virement entre deux
// comptes est ATOMIQUE (il s'exécute dans une seule transaction). Deux comptes dans
// des scopes différents ne pourraient PAS être virés atomiquement.
const grid = new XNeuroneGrid(undefined, { headless: true });
const bank = new DurableKnowledgeBase(grid, factStore, 'bank'); // factStore = celui de l'étape 2

const ledger = new TransactionLedger(bank, { currency: 'USD' });

await bank.hydrate();   // au démarrage : recharge l'état durable depuis le store
```

> 💡 **Montants en plus petite unité.** Stocke les sommes en **entiers** (centimes), jamais en
> flottants — `1050` pour 10,50 $. Pas d'erreur d'arrondi sur l'argent.

## 4. L'API Express

```ts
import express from 'express';

const app = express();
app.use(express.json());

// 🔑 BONNE PRATIQUE — un refus métier n'est pas une exception : c'est une DONNÉE
// (`{ ok, reason }`). On mappe la raison vers le bon code HTTP.
const REASON_STATUS: Record<string, number> = {
  'bad-amount': 400, 'invalid-type': 400, 'unknown-account': 404,
  'below-floor': 422, 'above-ceiling': 422, 'velocity-exceeded': 429,
  'account-blocked': 409, 'account-closed': 409, 'rolled-back': 500,
};

// Petit wrapper : capture les erreurs async (Express 4 ne le fait pas seul).
const wrap = (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Ouvrir un compte
app.post('/accounts', wrap(async (req, res) => {
  const { id, owner, initialBalance = 0, floor = 0 } = req.body;
  await ledger.open(id, { initialBalance, floor });
  await bank.tell(id, 'titulaire', owner);   // métadonnée libre : à qui est le compte
  await bank.flush();                         // 🔑 durabilité GARANTIE avant de répondre
  res.status(201).json(ledger.account(id));
}));

// Dépôt
app.post('/accounts/:id/deposit', wrap(async (req, res) => {
  const r = await ledger.deposit(req.params.id, req.body.amount, { ref: req.body.ref });
  await bank.flush();
  if (!r.ok) return res.status(REASON_STATUS[r.reason!] ?? 400).json({ error: r.reason });
  res.json({ balance: r.balance });
}));

// Retrait (refusé si ça passe sous le plancher)
app.post('/accounts/:id/withdraw', wrap(async (req, res) => {
  const r = await ledger.withdraw(req.params.id, req.body.amount, { ref: req.body.ref });
  await bank.flush();
  if (!r.ok) return res.status(REASON_STATUS[r.reason!] ?? 400).json({ error: r.reason });
  res.json({ balance: r.balance });
}));

// Virement ATOMIQUE — débit + crédit, tout ou rien
app.post('/transfer', wrap(async (req, res) => {
  const { from, to, amount, ref } = req.body;
  const r = await ledger.transfer(from, to, amount, { ref });
  await bank.flush();
  if (!r.ok) return res.status(REASON_STATUS[r.reason!] ?? 400).json({ error: r.reason, side: r.side });
  res.json({ fromBalance: r.fromBalance, toBalance: r.toBalance });
}));

// Solde + titulaire (on combine la synthèse du ledger et un fait métier)
app.get('/accounts/:id', wrap(async (req, res) => {
  const acc = ledger.account(req.params.id);
  if (!acc) return res.status(404).json({ error: 'unknown-account' });
  res.json({ ...acc, owner: bank.ask(req.params.id, 'titulaire')[0] });
}));

// Historique paginé (le plus récent d'abord)
app.get('/accounts/:id/movements', wrap(async (req, res) => {
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || 20;
  res.json(ledger.movementsPage(req.params.id, { offset, limit, desc: true }));
}));

app.listen(3000, () => console.log('🏦 Bank API → http://localhost:3000'));
```

## 5. Essayer

```bash
# ouvrir deux comptes
curl -X POST localhost:3000/accounts -H 'content-type: application/json' \
  -d '{"id":"acc_alice","owner":"Alice","initialBalance":100000}'
curl -X POST localhost:3000/accounts -H 'content-type: application/json' \
  -d '{"id":"acc_bob","owner":"Bob"}'

# virement de 250,00 $ (en centimes)
curl -X POST localhost:3000/transfer -H 'content-type: application/json' \
  -d '{"from":"acc_alice","to":"acc_bob","amount":25000,"ref":"loyer"}'

# soldes
curl localhost:3000/accounts/acc_alice     # balance: 75000
curl localhost:3000/accounts/acc_bob       # balance: 25000
```

Coupe le serveur et relance-le : `hydrate()` rejoue le store, **les soldes sont toujours là**.

## Les bonnes pratiques, en résumé

1. **Un scope = une frontière transactionnelle.** Mets dans le même scope tout ce qui doit pouvoir
   être viré atomiquement (ici, toute la banque). Sépare les scopes pour isoler (un par client si
   les virements inter-clients ne sont pas nécessaires).
2. **`hydrate()` une fois au démarrage**, puis réutilise la même instance de KB / ledger.
3. **`flush()` après chaque écriture** avant de répondre — l'appelant a la certitude que c'est durable.
4. **Le métier renvoie des données, pas des exceptions** (`{ ok, reason }`) → mappe `reason` vers HTTP.
5. **Les soldes ne sont jamais stockés** : ils sont recalculés depuis les mouvements immuables. Rien
   à désynchroniser.
6. **Argent en entiers** (centimes).
7. **Mémoriser n'importe quel attribut** d'un compte avec un simple `tell` (ici `titulaire`) — la KB
   est aussi ta base de métadonnées.

## Pour aller plus loin

- **Types de transaction & plafonds** : configure `types` et des `limits` de vélocité à l'ouverture
  (ex. « max 3 retraits / jour ») — voir [Grand livre](/transaction-ledger).
- **Authentification & secrets** : protège un compte par code PIN avec `FactVault` (haché/chiffré,
  verrou après N échecs) — voir [Couche d'accès](/access-layer).
- **Cycle de vie** : `ledger.block()` / `unblock()` / `close()` pour geler ou fermer un compte.
- **Production** : remplace `new InMemoryFactStore()` par un adaptateur **connecté à ta base** —
  c'est toi qui crées la connexion (Postgres, MySQL…) ; LibXN ne voit que l'interface. Appelle
  `initLibxnSchema()` au démarrage pour créer les tables. L'exemple de connexion complet est dans
  [Persistance › Créer un store](/persistence#créer-un-store).
