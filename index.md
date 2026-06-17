---
layout: home

hero:
  name: QPath
  text: Mémoire symbolique adressable par contenu
  tagline: Une mémoire de faits et de raisonnement dans un seul graphe — déterministe, à 0 token, sans dépendance. Le LLM devient optionnel ; la mémoire et le raisonnement vivent ici.
  image:
    src: /logo.svg
    alt: QPath
  actions:
    - theme: brand
      text: Démarrer
      link: /04-guides/getting-started
    - theme: alt
      text: Pourquoi QPath
      link: /why-qpath
    - theme: alt
      text: Cas d'usage
      link: /use-cases
    - theme: alt
      text: Aperçu
      link: /00-overview
    - theme: alt
      text: Comportement dynamique
      link: /dynamic-behavior

features:
  - title: Le comportement = des faits gouvernés
    details: Pas seulement la mémoire — la LOGIQUE de l'app (flots, règles, limites, anti-fraude) vit dans des faits qu'on interroge, gouverne et fait évoluer À CHAUD, sans redéployer. Déterministe et traçable. Vitrine&#58; npm run example:ledger.
  - title: Adressable par contenu
    details: La position d'une donnée est entièrement déterminée par son contenu — récupération exacte, déterministe, sans index externe.
  - title: Symbolique & déterministe
    details: Faits (sujet, prédicat, objet), index inverses O(1), chaînage avant/arrière tracé. Le LLM est un verbalisateur optionnel ; le raisonnement vit ici.
  - title: 100% recall, sous la milliseconde
    details: Benchmark intégré (npm run bench) — récupération exacte, règles, jointures multi-variables, comparaisons numériques, agrégats et quantificateurs à 100% de recall, ~0.07 ms/requête.
  - title: Isomorphe & zéro dépendance
    details: Tourne en Node, navigateur, Web Worker. dependencies&#58; {}. Périphérie (Three.js, pgvector, embeddings) branchée via des ports.
---
