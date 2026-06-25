# QPath / LibXN — Documentation

Site de documentation de **QPath** / **LibXN** — une **mémoire symbolique déterministe** :
une seule structure qui stocke, indexe, récupère et raisonne, de façon **déterministe, à 0 token et sans
dépendance**. Le LLM devient optionnel.

> 🌐 Site **VitePress bilingue (fr / en)**. Lancer en local :
> ```bash
> npm install && npm run docs:dev   # http://localhost:5173
> npm run docs:build                # site statique → .vitepress/dist/
> ```
> Français = locale par défaut · English sous `/en/` · sélecteur de langue + recherche intégrés.

## Parcours

- **Aperçu** — ce que c'est, ce que ça fait, pourquoi c'est différent.
- **Pourquoi QPath** — les faiblesses des LLM seuls, et comment QPath les comble (avec ou sans LLM).
- **Composants clés** — les briques et à quoi elles servent.
- **Cas d'usage** & **Exemples** — domaines concrets + recettes de code (API publique).
- **Raisonnement** — Flash reasoning, PingPong reasoning.
- **Outils** — comment un dev crée un outil que QPath consomme.
- **Démarrer** & **Architecture**.

## Statut

Le noyau QPath est extrait en librairie autonome et framework-agnostic. Les couches optionnelles
(visualisation, persistance vectorielle, ponts LLM) se branchent via des ports.

---

> Le fonctionnement interne de QPath (encodage, spécification formelle) n'est pas documenté
> publiquement. Pour un accès technique ou un partenariat, contactez l'auteur.
