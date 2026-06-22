# Cycle de vie d'un prompt

Que se passe-t-il, étape par étape, quand un utilisateur envoie un message ? QPath suit une règle
simple : **le plus déterministe d'abord, le LLM en dernier recours**. On essaie les chemins qui lisent
ou écrivent la **mémoire de faits** à **0 token** ; on n'appelle un modèle de langage que si rien de plus
sûr n'a répondu, et même là, il reste **ancré dans la mémoire**.

Le **premier tier qui correspond répond et s'arrête** : une commande n'atteint jamais le LLM, une
question n'écrit jamais, une affirmation ne part jamais en génération.

```mermaid
flowchart TD
  U([Nouveau prompt utilisateur]) --> R{Grille de routage<br/>déterministe}

  R -->|Commande| CMD[Action sur l'application]
  R -->|Social / identité| SOC[Réponse cadrée]
  R -->|Affichage| DISP[Montrer un élément]
  R -->|Affirmation| WRITE[Écriture d'un fait]
  R -->|Question directe| ASK[ask · lecture exacte]
  R -->|Raisonnement| REASON[reason · héritage / multi-saut]
  R -->|Vague ou reformulée| RAG[Recherche sémantique]
  R -->|Aucun match sûr| LLM[Génération LLM ancrée]

  WRITE -->|tell| KB[("Mémoire QPath<br/>faits sujet-prédicat-objet")]
  ASK -->|lit · 0 token| KB
  REASON -->|lit · 0 token| KB
  RAG -->|lit par le sens| KB
  LLM -->|boucle d'outils<br/>qpath / read| KB
  KB -.->|faits trouvés| LLM

  WRITE --> ACK([Accusé : c'est mémorisé])
  CMD --> OUT([Réponse])
  SOC --> OUT
  DISP --> OUT
  ASK --> OUT
  REASON --> OUT
  RAG --> OUT
  LLM --> OUT

  classDef zero fill:#0e2a1f,stroke:#2f9e7a,color:#bff6e2;
  classDef gen fill:#2a230e,stroke:#a98a2f,color:#f3e2b3;
  classDef mem fill:#0d2030,stroke:#2f7fa9,color:#cfe9f7;
  class CMD,SOC,DISP,WRITE,ASK,REASON,RAG zero;
  class LLM gen;
  class KB mem;
```

## Lecture du graphe

- **En vert : les chemins à 0 token.** Ils lisent ou écrivent directement la mémoire QPath, sans appeler
  de modèle. C'est la voie normale, et de loin la plus fréquente.
- **En bleu : la mémoire de faits** (le graphe QPath de triplets). Tout converge vers elle.
- **En ambre : la génération LLM**, atteinte uniquement quand aucun chemin sûr n'a répondu.

## Étape par étape

1. **Le message arrive** et passe dans la **grille de routage**, du plus déterministe au moins.
2. **Commande** (« ouvre le coffre », « efface mes notes ») : une action s'exécute, on s'arrête. Le LLM
   n'est jamais sollicité.
3. **Social / identité** (« bonjour », « qui es-tu ? ») : réponse cadrée, 0 token.
4. **Affichage** (« montre mes photos ») : on présente un élément déjà en mémoire.
5. **Affirmation** (« Marie habite à Lyon ») : on **écrit** un fait dans la mémoire (`tell`) et on accuse
   réception. Une affirmation ne part **jamais** en génération.
6. **Question directe** (« où habite Marie ? ») : on **lit** la mémoire (`ask`) et on répond. 0 token.
7. **Raisonnement** (« Socrate est-il mortel ? ») : on suit les chaînes d'héritage et les sauts multiples
   dans le graphe (`reason`). Toujours une **lecture** de la mémoire, 0 token.
8. **Question vague ou reformulée** (« qui a plaidé coupable ? » alors que le fait est tourné autrement) :
   recherche **par le sens** dans la mémoire (embeddings). Toujours sans génération.
9. **Dernier recours : le LLM.** Si rien n'a répondu, on génère, mais le modèle **n'invente pas seul** :
   il dispose d'une **boucle d'outils** pour **interroger la mémoire** (lire des faits, lancer une requête
   QPath), récupère ce qu'il faut, puis répond **ancré** dans ces faits.

## Quand, exactement, le LLM interroge la mémoire

C'est le point clé du dernier tier. Le LLM ne reçoit pas tout le contenu de la mémoire ; il **demande**
ce dont il a besoin :

```text
Utilisateur : « Résume ce que tu sais sur l'affaire Vanier. »
   -> aucun tier déterministe ne tranche -> LLM
   LLM : <qpath> faits du sujet « affaire vanier » </qpath>
   Mémoire : renvoie les triplets pertinents (0 token de lecture)
   LLM : rédige la réponse à partir de CES faits, sans en inventer.
```

Ainsi, même le chemin « LLM » reste tiré par la mémoire : la génération sert à **formuler**, pas à
**connaître**. Les faits viennent du graphe ; le modèle les met en phrases.

> 🔎 **Pourquoi cet ordre.** Mettre la déduction exacte en premier donne des réponses **vérifiables,
> reproductibles et gratuites** ; réserver le LLM au dernier tier limite le coût et les hallucinations,
> puisqu'il répond sur des faits récupérés plutôt que de mémoire propre.
