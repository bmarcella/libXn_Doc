# Déduction proactive

Un mode de raisonnement qui **parle sans question**. Les autres moteurs répondent quand on les
interroge ; celui-ci balaie la mémoire en continu et **anticipe** — il propose des faits, et
**alerte** sur ce que l'utilisateur n'a pas vu. Déterministe, à 0 token.

## Les alertes

| Aperçu | Ce qu'il détecte | Exemple |
|--------|------------------|---------|
| **contradiction** | un **même objet** est à la fois affirmé ET nié pour un sujet (`p` et `not_p` sur la **même** valeur). Des objets **différents** ne se contredisent pas (« peut utiliser » + « ne peut pas procéder » est cohérent) | « x aime thé » ET « x n'aime pas thé » |
| **presque-règle violée** | une régularité forte avec UN contre-exemple | « tous les habitants de France parlent français — sauf e. Oubli ou exception ? » |
| **donnée manquante** | un membre d'une classe sans l'attribut que les autres ont | « Diana est la seule employée sans salaire » |
| **trame incohérente** | une cause prouvée postérieure à son effet | « l'évacuation causerait l'alarme, or l'alarme précède l'évacuation » |
| **faits périmés** | la fraîcheur a expiré | « 3 faits web de plus de 30 jours à revérifier » |

## Les anticipations

Sur les sujets en focus (la conversation en cours) :

- **sujets similaires** — « titi ressemble à tweety (4 faits communs) — comparer ? » ;
- **faits hérités méconnus** — « au passage : tweety a des plumes (hérité d'oiseau) ».

## En pratique

```ts
import { KnowledgeBase, XNeuroneGrid, InsightEngine } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));

// Une contradiction…
await kb.tell('x', 'aime', 'thé', { kind: 'user' });
await kb.tell('x', 'not_aime', 'thé', { kind: 'user' });
// …et une donnée manquante : tous les employés ont un salaire, sauf diana
for (const e of ['alice', 'bob', 'carol']) {
  await kb.tell(e, 'est', 'employé', { kind: 'user' });
  await kb.tell(e, 'salaire', '3000', { kind: 'user' });
}
await kb.tell('diana', 'est', 'employé', { kind: 'user' });   // pas de salaire

const insights = new InsightEngine(kb);

// Balaie la mémoire — alertes d'abord, puis anticipations sur le focus (conversation en cours).
for (const i of insights.scan({ focus: ['x'] })) {
  console.log(`[${i.severity}] ${i.kind} — ${i.text}`);
}
// [warning] contradiction — « x aime thé » ET « x not_aime thé » coexistent…
// [warning] gap — diana est le seul « employé » sans « salaire »
```

Détail des fonctions employées ci-dessus.

**`new XNeuroneGrid(encoder?, opts?)`** — le graphe QPath en mémoire (le « moteur » sous la KB).

- `encoder?` — l'encodeur input → bitstream. **Optionnel** : `undefined` (le placeholder de tous les exemples) prend l'encodeur **par défaut** du noyau. Tu ne le passes que pour un encodage sur-mesure.
- `opts?` — un objet `{ headless?: boolean }`. **Défaut `{}`** (= avec rendu). `headless: true` désactive le rendu Three.js : indispensable côté **Node/serveur** (pas de DOM) et pour les tests.

**`new KnowledgeBase(grid)`** — la couche de faits `(sujet, prédicat, objet)` posée sur la grille.

- `grid` — la `XNeuroneGrid` qui sert de mémoire de travail. **Seul argument**, requis. Si la grille est pré-remplie (snapshot rechargé), le constructeur **reconstruit ses index** au passage.

**`kb.tell(s, p, o, source?, flags?)`** — enregistre un fait. Asynchrone.

| Argument | Rôle | Défaut |
|---|---|---|
| `s` | le **sujet** (ex. `'x'`, `'diana'`) | — (requis) |
| `p` | le **prédicat** (ex. `'aime'`, `'salaire'`) ; un `not_<p>` exprime la **négation** du même prédicat | — (requis) |
| `o` | l'**objet** / la valeur (ex. `'thé'`, `'3000'`) | — (requis) |
| `source?` | la **provenance** du fait — un objet `{ kind, ref? }`. `kind` vaut `'user'` (saisie/chat), `'document'`, `'web'`, `'tool'`, `'llm-verified'`, `'inference'` ou `'import'` ; `ref?` est une URL / un id de document / un nom d'outil | — (aucune provenance) |
| `flags?` | drapeaux atomiques posés dans la **même** écriture (ex. `{ secret: true }`, `closed`, `major`) | — (aucun drapeau) |

> 💡 **`{ kind: 'user' }` n'est pas obligatoire** — c'est le `source` (optionnel). On le renseigne ici pour marquer que ces faits viennent de l'utilisateur, ce qui rend les aperçus plus parlants (« décision contestée », fraîcheur…). Sans lui, `tell` fonctionne tout autant.
>
> **Forme de retour** : `tell` renvoie une `Promise<ContradictionReport | null>` — `null` si tout va bien, un **rapport de contradiction** si l'opposé exact (`p` ↔ `not_p`) existait déjà. (`InsightEngine` détecte aussi ces contradictions *a posteriori* via `scan`, donc ignorer ce retour reste sûr.)

**`new InsightEngine(kb)`** — le moteur de déduction proactive.

- `kb` — la `KnowledgeBase` à surveiller. **Seul argument**, requis. Le moteur ne stocke rien lui-même : il **lit** la KB à chaque `scan` (déterministe, 0 token).

**`insights.scan(opts?)`** — balaie la mémoire et renvoie les aperçus.

| Option (`opts`) | Rôle | Défaut |
|---|---|---|
| `focus?` | sujets prioritaires (la conversation en cours) — **active** les anticipations ciblées et **priorise** ces sujets dans le tri | `[]` (aucun focus → pas d'anticipations) |
| `maxInsights?` | plafond du nombre d'aperçus retournés (alertes d'abord) | `10` |
| `alertsOnly?` | `true` coupe les anticipations `info` (ne garde que les alertes `warning`) | `false` |

> **Forme de retour** : un **tableau `Insight[]`** trié (alertes `warning` d'abord, puis anticipations touchant le focus, puis le reste, tronqué à `maxInsights`). Chaque `Insight` porte : `kind` (`'contradiction'` \| `'plot-incoherence'` \| `'anomaly'` \| `'gap'` \| `'stale'` \| `'suggestion'`), `severity` (`'warning'` \| `'info'`), `text` (phrase lisible prête pour le chat), `about` (les sujets concernés) et `key` (clé stable de déduplication — voir ci-dessous). L'appel sans argument, `scan()`, équivaut à `scan({})`.

**Déduplication entre scans** — chaque aperçu porte une **clé stable** (`i.key`) : l'hôte garde ce
qu'il a déjà montré et n'alerte **qu'une fois**.

```ts
const seen = new Set<string>();
function nouveauxAperçus() {
  const fresh = insights.scan().filter(i => !seen.has(i.key));
  fresh.forEach(i => seen.add(i.key));   // au prochain scan, on ne les re-signale plus
  return fresh;
}
```

Options de `scan(opts)` : `focus` (sujets prioritaires), `alertsOnly: true` (coupe les
anticipations `info`), `maxInsights` (plafond, défaut 10).

## Le contrat

- Chaque aperçu porte une **clé stable** : l'hôte déduplique — on n'alerte **qu'une fois**.
- Les alertes sont **globales** (toute la mémoire) ; le focus ne fait que prioriser.
- Tout est déterministe et traçable : un aperçu se vérifie comme n'importe quel fait.

C'est la mémoire qui devient **collègue** : elle ne se contente plus de répondre juste,
elle remarque ce qui cloche et le dit.
