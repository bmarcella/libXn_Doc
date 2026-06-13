# Déduction proactive

Un mode de raisonnement qui **parle sans question**. Les autres moteurs répondent quand on les
interroge ; celui-ci balaie la mémoire en continu et **anticipe** — il propose des faits, et
**alerte** sur ce que l'utilisateur n'a pas vu. Déterministe, à 0 token.

## Les alertes

| Aperçu | Ce qu'il détecte | Exemple |
|--------|------------------|---------|
| **contradiction** | deux faits opposés coexistent | « x aime thé » ET « x n'aime pas thé » |
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
