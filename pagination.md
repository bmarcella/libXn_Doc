# Parcourir de grands ensembles : pages et filtres

Une mémoire utile grossit. Passé quelques milliers de faits, la question n'est plus « comment les
lire » mais « comment n'en lire que ce qu'il faut, sans jamais laisser croire qu'on a tout vu ».

LibXN répond avec **un seul vocabulaire de filtre**, utilisable au même endroit sur une mémoire
chargée en mémoire vive comme sur une base de plusieurs millions de lignes.

## Un filtre, une définition

Un filtre porte sur les trois termes d'un fait — sujet, prédicat, objet — et chaque terme accepte
soit une valeur exacte, soit un comparateur :

| Opérateur | Sens |
|---|---|
| `=` · `!=` | égal, différent |
| `like` | contient (insensible à la casse) |
| `in` | appartient à une liste |
| `<` `<=` `>` `>=` | comparaison **numérique** de la valeur |

```ts
kb.matchFacts({ p: 'ville', o: 'paris' });
kb.matchFacts({ p: 'age', o: { op: '>=', value: 30 } });
kb.matchFacts({ p: 'nom', o: { op: 'like', value: 'dupont' } });
```

Les comparateurs numériques lisent le nombre **en tête** de la valeur : « 60 kg » vaut 60, « 1,5 »
vaut 1,5, et une valeur sans nombre est simplement écartée. C'est ce qui évite le classique « 10 »
qui passe avant « 9 » parce qu'on a comparé du texte.

Le même prédicat est exposé seul, pour filtrer une liste déjà chargée sans réécrire la règle :

```ts
matchesValue('60 kg', { op: '>=', value: 60 });   // true
```

## Une page dit toujours son total

```ts
const page = kb.matchSubjectsPage({ p: 'created_via', o: 'form:client' }, { offset: 50, limit: 25 });
// { items: [...25], total: 1240, offset: 50, limit: 25, hasMore: true }
```

`total` est le nombre d'éléments **avant** découpe. Sans lui, l'appelant ne peut ni afficher
« page 3 sur 50 », ni savoir qu'il ne montre pas tout — et une liste tronquée en silence se lit
exactement comme une liste complète. C'est le défaut le plus coûteux d'une pagination bâclée.

## Paginer des entités, pas des faits

Une entité vaut plusieurs faits. Découper les *faits* couperait une entité en deux d'une page à
l'autre : la moitié de ses attributs page 2, l'autre page 3.

- `matchSubjectsPage(filtre, page)` — les **sujets** distincts : « liste-moi les clients » ;
- `matchFactsPage(filtre, page)` — les **faits**, quand c'est bien de faits qu'on parle ;
- `listSubjectsPage(page)` — les sujets par richesse, avec leur total.

La marche à suivre est donc en deux temps : paginer les sujets, puis charger les faits des seuls
sujets de la page.

## Le même filtre, exécuté par la base

Les fonctions ci-dessus travaillent sur une mémoire chargée. Quand le corpus vit dans PostgreSQL,
l'adaptateur traduit **le même filtre** en SQL — mêmes opérateurs, même sémantique numérique :

```ts
const q = pgFactQuery(sql);
const page = await q.subjects({
  scope: 'user',
  filter: { p: 'created_via', o: 'form:client' },
  limit: 25, offset: 50,
});
const faits = await q.factsOfSubjects(page.items, { scope: 'user' });
```

Le total vient d'un comptage fenêtré dans la **même** requête : un comptage séparé pourrait voir un
autre état de la table et annoncer un nombre de pages faux. Les jokers de recherche (`%`, `_`) sont
échappés, faute de quoi une recherche sur « 100% » ramènerait tout.

Un point à connaître : l'ordre alphabétique vient de la collation de la base, celui de la mémoire de
`localeCompare`. Sur des accents ou des casses mêlées, les deux peuvent différer d'un cran. Le tri
numérique, lui, est aligné des deux côtés.

## Ce que ça évite

Un écran qui charge tout « pour l'instant ça va » fonctionne jusqu'au jour où il ne fonctionne plus,
et il échoue mal : il affiche une liste plausible mais incomplète, sans rien signaler. Une page qui
porte son total transforme cette panne silencieuse en information — « 1240 éléments, 25 affichés » —
que l'écran peut montrer et l'utilisateur comprendre.
