# Mémoire d'entités — similarité & prédiction, sans entraînement

Vous enregistrez des faits sur des personnes ou des choses. La **mémoire d'entités** répond alors à deux
questions que la mémoire de faits classique ne sait pas traiter : « **qui ressemble à X ?** » et « **quel
est le trait manquant probable de X ?** » — de façon **déterministe**, **sans entraînement**, à partir des
faits que vous avez déjà.

> 💡 **L'idée.** Une entité enregistrée **une seule fois** rassemble ses faits. Deux entités aux faits
> proches sont reconnues comme **proches**. On peut alors **trouver les semblables** et **deviner un trait
> absent** — **0 entraînement, 0 token**, et c'est **reproductible**.

## Enregistrer & trouver les semblables

```ts
import { EntityMemory } from '@damba/libxn-qpath-ml';

const mem = new EntityMemory();

mem.register('jean',   [{ role: 'ville', value: 'lyon' },  { role: 'age', value: 30 }, { role: 'metier', value: 'medecin' }]);
mem.register('pierre', [{ role: 'ville', value: 'lyon' },  { role: 'age', value: 31 }, { role: 'metier', value: 'medecin' }]);
mem.register('marie',  [{ role: 'ville', value: 'paris' }, { role: 'age', value: 70 }]);

mem.similar('jean');
//   → [ { name: 'pierre', distance: … }, { name: 'marie', distance: … } ]
//     pierre arrive en premier : il partage le plus de faits avec jean (plus la distance est petite, plus c'est proche).
```

## Deviner un trait manquant

À partir des entités les plus proches qui **possèdent** le trait visé, on en déduit la valeur probable —
**vote** pour une valeur de texte, **moyenne** pour un nombre.

```ts
mem.predict('marie', 'metier');
//   → { value: 'medecin', confidence: 0.8, support: 4 }   ← déduit via les voisins de marie

// Les valeurs numériques PROCHES sont traitées comme proches (20 et 21 se ressemblent) :
mem.predict('marie', 'age');
//   → { value: 31, confidence: 1, support: 3 }
```

## La mémoire suit les faits dans le temps

La représentation d'une entité est **toujours dérivée de ses faits actuels** : ajouter, corriger ou
retirer un fait met à jour les comparaisons **automatiquement** (rien à resynchroniser).

```ts
mem.add('marie', 'metier', 'avocate');     // un nouveau fait
mem.remove('jean', 'ville', 'lyon');        // une correction
mem.forget('pierre');                        // oublier une entité
```

## Récupérer une entité seule

Chaque entité est **indépendante** : on peut en sauver/charger **une** sans reconstruire toute la mémoire
(idéal pour brancher sur une base de faits existante, entité par entité).

```ts
const fiche = mem.exportEntity('jean');     // { name: 'jean', facts: [...] }
//   … plus tard, ou ailleurs …
autreMem.importEntity(fiche);                // recharge jean seul, à l'identique
```

## Les fonctions

- **`register(name, facts)`** — enregistre (ou remplace) une entité avec ses faits `{ role, value }`.
- **`add(name, role, value)` / `remove(name, role, value?)` / `forget(name)`** — fait évoluer une entité ;
  les comparaisons suivent.
- **`similar(name, k?)` → `{ name, distance }[]`** — les `k` entités **les plus proches**.
- **`predict(name, role, k?)` → `{ value, confidence, support }`** — **devine** un trait manquant via les
  voisins (vote pour le texte, moyenne pour un nombre).
- **`names()`** — la liste des entités connues.
- **`exportEntity(name)` / `importEntity(record)`** — sauver / charger **une** entité.

## Cas d'usage

| Besoin | Appel |
|---|---|
| « Trouve-moi quelqu'un comme **jean** » (rapprochement, CRM, mise en relation) | `similar('jean')` |
| « Quel est sans doute le **métier** de marie ? » (enrichissement de profil) | `predict('marie', 'metier')` |
| Regrouper des entités semblables (dédup, segments) | `similar` sur chaque entité |
| Recommander : plus les faits collent, plus c'est proche | la `distance` de `similar` |

> ⚠️ **C'est une similarité par les faits enregistrés.** Plus une entité a de faits pertinents, meilleures
> sont la ressemblance et la prédiction. La mémoire d'entités **complète** la mémoire de faits (exacte) :
> l'une **range** jean, l'autre **reconnaît qui lui ressemble**.

## Pour aller plus loin

- [Extraction de faits](/fact-extraction) — d'où viennent les faits `(rôle, valeur)`.
- [Prédiction (grille)](/prediction) — régression / classification directement sur la grille QPath.
- [Faits compagnons](/companion-facts) — rattacher des faits à une entité propriétaire.
