# PingPong Reasoning

Un mode de raisonnement par **échange court et alterné entre QPath et un LLM**. Comme une balle qui
rebondit entre deux joueurs aux forces opposées :

- **QPath renvoie le coup déterministe** — faits vérifiés, déductions tracées, à 0 token.
- **Le LLM renvoie le coup créatif** — le prochain pas que QPath ne peut pas faire seul.

L'idée : résoudre ce que **ni l'un ni l'autre ne fait seul**. QPath seul bloque sur les raisonnements
ouverts ; le LLM seul hallucine. Le ping-pong fait avancer le LLM **pas à pas, chaque pas validé par
QPath**.

## Comment ça marche

À chaque échange, le LLM joue **un seul coup** ; QPath répond par un **verdict déterministe** :

| Coup du LLM | QPath fait… | Verdict |
|-------------|-------------|---------|
| **demander** un fait | il le cherche dans sa mémoire / le déduit | trouvé · inconnu |
| **proposer** une hypothèse | il la **vérifie** | vérifié · réfuté · inconnu |
| **conclure** | l'échange s'arrête | — |

Trois garde-fous :

- **Ancrage** — le LLM ne peut pas faire avaler un fait faux : si QPath connaît une autre valeur, il
  **réfute**. Pas d'hallucination silencieuse. L'indicateur `grounded` reste **honnête** : il n'est
  vrai que si **aucun** fait non vérifié par QPath n'a été écrit en mémoire — si un outil externe a
  ajouté des faits non confrontés, la réponse est marquée comme **non entièrement ancrée**.
- **Mémoire qui grandit** — une hypothèse **vérifiée** est réinjectée dans la mémoire : la prochaine fois,
  QPath répond seul, à 0 token.
- **Échange court** — borné (quelques rounds) ; l'échange s'arrête dès que QPath confirme une conclusion,
  que le LLM conclut, ou que la limite est atteinte. Et **toute la transcription est conservée** (qui a
  joué quoi, et le verdict de QPath) → auditable.

### Notes d'intégration

- Les coups ASK / HYPOTHESIS / TOOL sont **mono-ligne** ; la conclusion `CONCLUDE` peut être
  **multi-ligne** (listes, paragraphes) — tout ce qui suit le mot-clé appartient à la réponse.
- Le dialogue tolère mieux les **valeurs contenant une virgule** (objets composites comme
  « New York, USA ») : avec le format canonique `s | p | o`, l'objet n'est plus tronqué à la virgule.
- Les règles du jeu sont exportées (`PINGPONG_SYSTEM_RULES`) pour que l'hôte les **compose avec sa
  propre identité produit** (`systemPrompt: identité + règles`) au lieu de les remplacer — sinon le
  LLM perd son identité pendant l'échange.
- **Routez en amont** : n'envoyez en PingPong que les questions qui portent sur la mémoire de
  faits (forme sujet/prédicat, sujet connu de la base, trame d'événements). Méta-conversation,
  actualités et questions générales n'ont rien à y gagner — PingPong n'a aucune vue dessus.
- Le verdict d'un coup TOOL transmet le **texte lisible** du résultat (`ToolResult.text`) au LLM ;
  sérialisez vos valeurs structurées, sinon elles n'aident personne.

## Quand l'utiliser

| Situation | Mode conseillé |
|-----------|----------------|
| La réponse est une **déduction symbolique** (héritage, transitivité) | **ChainResolver** seul (0 token, déterministe) |
| Question **décomposable** en sous-questions traitées en une passe | **Flash reasoning** |
| Raisonnement **ouvert / multi-étapes** où il faut faire avancer le LLM pas à pas, en validant chaque pas | **PingPong** |

En clair : PingPong est le bon mode quand QPath **seul** ne conclut pas, mais que **chaque pas** vers la
réponse *peut* être vérifié par QPath. On garde la rigueur de QPath **et** la souplesse du LLM.

## Exemple

QPath fournit le « joueur LLM » via un petit **port** (n'importe quel LLM : LangChain, un proxy
backend…). Le raisonneur orchestre l'échange.

```ts
import { XNeuroneGrid, KnowledgeBase, PingPongReasoner, LlmPort } from '@damba/libxn';

// 1. Brancher un LLM (ici un adaptateur minimal ; voir Flash reasoning pour LangChain)
const llm: LlmPort = {
  async complete(prompt, opts) {
    return await monLLM(prompt, opts?.systemPrompt); // ChatAnthropic, ChatOpenAI, backend…
  },
};

// 2. Une mémoire QPath avec quelques faits
const kb = new KnowledgeBase(new XNeuroneGrid(undefined, { headless: true }));
await kb.tell('alice', 'est_parent_de', 'charlie');
await kb.tell('charlie', 'est_parent_de', 'diana');

// 3. L'échange : QPath seul ne sait pas conclure « ancêtre » — le ping-pong y arrive,
//    en faisant valider chaque maillon (alice→charlie, charlie→diana) par QPath.
const result = await new PingPongReasoner(kb, llm).run(
  'Alice est-elle ancêtre de Diana ?',
  { seedSubject: 'alice', maxRounds: 3 },
);

console.log(result.conclusion);   // réponse ancrée sur les faits vérifiés
console.log(result.transcript);   // l'échange complet, round par round
console.log(result.grounded);     // true : aucun fait non vérifié par QPath n'a été écrit en mémoire
```

Le résultat contient la **conclusion**, la **transcription** (chaque coup + verdict QPath), les **faits
appris** (réinjectés), et `grounded` — vrai uniquement si **aucun** fait non vérifié par QPath n'a été
écrit en mémoire (un outil externe ajoutant des faits non confrontés le passe à `false`).

::: tip
Le détail interne du protocole n'est pas documenté publiquement. Pour un accès technique ou un
partenariat, contactez l'auteur. Voir aussi [Flash reasoning](flash-reasoning) et
[Composants clés](components).
:::
