# Règles & induction

Au-delà des faits, QPath raisonne avec des **règles** : « si … alors … ». Une règle ajoutée **dérive**
de nouveaux faits automatiquement, et chaque fait dérivé garde sa **provenance** (« pourquoi je sais
ça ? »). Mieux : le moteur sait **découvrir** des règles plausibles à partir des données, et accepter
une règle dictée en **langage naturel**.

> 💡 **Déterministe et auditable.** Aucune dérivation magique : on peut toujours demander d'où vient un
> fait, simuler une règle avant de l'adopter, et la rétracter proprement.

> 🎯 **Cas d'usage.** « Tout employé basé en France parle français. » Dès qu'on ajoute « Alice est
> employée » et « Alice est basée en France », le fait « Alice parle français » est **dérivé
> automatiquement**, avec sa provenance ; si on retire une prémisse, le fait dérivé disparaît proprement.
> Le problème résolu : encoder une politique **une fois** plutôt que ressaisir la conséquence pour chaque cas.

## Écrire une règle et dériver

```ts
import { RuleEngine, KnowledgeBase, XNeuroneGrid } from '@damba/libxn';

const kb = new KnowledgeBase(new XNeuroneGrid());
await kb.tell('alice', 'parent_de', 'charlie');
await kb.tell('charlie', 'parent_de', 'diana');

const engine = new RuleEngine(kb);
engine.addRuleFromText('X parent_de Y ; Y parent_de Z => X grand_parent_de Z', 'grand-parent');

await engine.applyAllRules();
kb.ask('alice', 'grand_parent_de');                 // → ['diana']
engine.whyDerived('alice', 'grand_parent_de', 'diana');
//    → { ruleName: 'grand-parent', binding: 'X=alice, Y=charlie, Z=diana' }
```

- **`addRuleFromText(dsl, name, origin?)` → `Rule | null`** — ajoute une règle « conditions `=>`
  conclusions » (normalisée + validée). `null` si refusée (raison dans `lastRefineError`).
- **`applyAllRules()` → `Promise<number>`** — chaînage avant : applique toutes les règles jusqu'à
  stabilité, renvoie le nombre de faits ajoutés.
- **`whyDerived(s, p, o)` → `DerivedFact | undefined`** — la **provenance** d'un fait dérivé (règle +
  variables) ; `undefined` s'il est direct.
- **`dryRun(rule)` → `{ solutions, conclusions, truncated }`** — **simule** ce qu'une règle produirait,
  sans rien écrire — pour décider avant d'adopter.

## Dicter une règle en langage naturel

```ts
import { NaturalRuleParser, RuleFactory } from '@damba/libxn';

const parsed = NaturalRuleParser.parse('Si une personne est majeure alors elle peut voter');
//    → { dsl: 'X est majeure => X peut voter', … }
if (parsed) {
  engine.addRuleFromText(parsed.dsl, 'saisie-naturelle');
}
```

- **`NaturalRuleParser.parse(text)` → `ParsedRuleNL | null`** — convertit « si … alors … » / « tout … »
  (FR + EN) en DSL. **Conservateur** : `null` si ce n'est pas clairement une règle (un simple fait
  n'est pas transformé).
- **`RuleFactory.refine(dsl)` → `{ ok, rule | reason, warnings }`** — contrôle qualité : normalise et
  **rejette avec motif** (variable non liée, tautologie, condition dupliquée…).

## Découvrir des règles à partir des données

`RuleInducer` propose des règles plausibles en observant les **régularités** — chaque proposition est
**testée** (support, confiance, contre-exemples). L'humain valide avant adoption.

```ts
import { RuleInducer } from '@damba/libxn';

for (const who of ['alice', 'bob', 'charlie']) {
  await kb.tell(who, 'habite', 'france');
  await kb.tell(who, 'parle', 'francais');
}

const report = new RuleInducer(kb).induce({ minConfidence: 0.8 });
report.proposals[0];
//    → { dsl: 'X habite france => X parle francais', support: 3, confidence: 1, counterexamples: [] }
```

- **`induce(opts?)` → `InductionReport`** — mine des implications et des compositions, les teste contre
  la KB, renvoie des **propositions triées par confiance** avec leurs **contre-exemples** (preuve
  d'imperfection). Options : `minSupport`, `minConfidence`, `maxRules`.

## Les exceptions, parce qu'un domaine réel en est fait

Une règle générale suivie de ses exceptions, c'est la forme même d'un code, d'une norme ou d'une
procédure interne. Sans exceptions, une base produit des règles vraies une à une et fausses
ensemble.

Une règle porte donc une clause **`unless`** (« sauf si »), et une **priorité**. Quand deux règles
concluent des choses différentes sur le même sujet, c'est la plus **spécifique** qui l'emporte,
c'est-à-dire celle dont les conditions sont un sur-ensemble strict de l'autre.

```ts
engine.addRuleFromText(
  'X employe vrai => X acces vrai unless X suspendu vrai',
  'acces-employe',
);
```

En langage naturel, « sauf si », « sauf s'il », « à moins que » et « unless » sont reconnus.

### Une conclusion peut être retirée plus tard

C'est la propriété qui manque à la plupart des moteurs : un fait dérivé dont l'exception devient
vraie **est retiré**, sans qu'on ait à rejouer quoi que ce soit à la main. Ajouter « Alice est
suspendue » après coup retire l'accès qui avait été dérivé.

### Un conflit se dit, il ne se perd pas

Un dérivé écarté par une exception ou par une règle plus spécifique est **consigné**, jamais
supprimé en silence. On peut donc demander pourquoi une conclusion attendue n'est pas là.

```ts
engine.listConflicts();                       // ce qui a été bloqué, et par quoi
engine.whyBlocked('alice', 'acces', 'vrai');  // la règle qui l'emporte, ou l'exception qui joue
```

> ⚠️ **Limite connue.** Une exception qui dépend de sa propre chaîne (« a implique b, sauf c ;
> b implique c ») se stabilise sans boucler, mais laisse la conclusion intermédiaire en place :
> la révision juge la **défaite**, pas le **support**. Le retrait complet passe par la
> rétractation, qui redérive.

## Cas d'usage

| Situation | Outil |
|---|---|
| Dériver automatiquement (grands-parents, droits d'accès, catégories) | `RuleEngine` + `applyAllRules` |
| Laisser un utilisateur écrire une règle en français | `NaturalRuleParser` → `RuleEngine` |
| Vérifier une règle avant de l'activer | `dryRun` (simulation) |
| Faire émerger des règles cachées des données | `RuleInducer.induce` → validation humaine |
| Expliquer une conclusion (« pourquoi ? ») | `whyDerived` (provenance) |

> 🔒 **Garde-fous.** Une règle ne s'applique que si elle **parse exactement** comme les faits
> (`RuleFactory`), une règle induite n'est jamais adoptée sans **validation humaine**, et tout fait
> dérivé reste **rétractable** (maintenance de vérité).
