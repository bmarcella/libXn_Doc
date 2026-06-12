import { defineConfig } from 'vitepress';

// Site de documentation LibXN / QPath — bilingue (fr par défaut, en sous /en/).
export default defineConfig({
  title: 'LibXN · QPath',
  // lastUpdated désactivé : il lance `git log` par page → "spawn git ENOENT" si git n'est pas dans
  // le PATH du serveur dev (et nécessite des fichiers commités). Réactivable une fois git dispo + repo commité.
  lastUpdated: false,
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#06b6d4' }],
  ],
  // README.md sert d'index GitHub ; le site a sa propre home (index.md). Les .ts d'exemples ne sont pas des pages.
  // ⚠️ Doc technique détaillée EXCLUE du site public (protection IP) : concepts (dont le mapping
  // bit→direction), spécification formelle QPath, et référence d'API. Les fichiers .md restent dans
  // le repo pour usage interne, mais ne sont PAS générés dans le site.
  srcExclude: [
    'README.md', 'en/README.md',
    '01-concepts/**', 'en/01-concepts/**',
    '02-spec/**', 'en/02-spec/**',
    '03-api/**', 'en/03-api/**',
  ],
  // Les liens vers les exemples .ts pointent vers des fichiers source du repo, pas des pages du site.
  ignoreDeadLinks: [/examples/, /\.ts$/],
  themeConfig: {
    logo: '/logo.svg',
    search: { provider: 'local' },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/' },
    ],
  },
  locales: {
    // ── Français (locale par défaut, à la racine) ──
    root: {
      label: 'Français',
      lang: 'fr-FR',
      description: 'QPath — mémoire symbolique adressable par contenu, en un seul graphe.',
      themeConfig: {
        nav: [
          { text: 'Aperçu', link: '/00-overview' },
          { text: 'Pourquoi QPath', link: '/why-qpath' },
          { text: 'Composants', link: '/components' },
          { text: "Cas d'usage", link: '/use-cases' },
          { text: 'Exemples', link: '/examples' },
          { text: 'Flash reasoning', link: '/flash-reasoning' },
          { text: 'PingPong reasoning', link: '/pingpong-reasoning' },
              { text: 'Plot reasoning', link: '/plot-reasoning' },
          { text: 'Outils', link: '/tools' },
          { text: 'Provenance', link: '/fact-provenance' },
          { text: 'Démarrer', link: '/04-guides/getting-started' },
          { text: 'Architecture', link: '/04-guides/architecture' },
        ],
        sidebar: [
          {
            text: 'Documentation',
            items: [
              { text: 'Aperçu', link: '/00-overview' },
              { text: 'Pourquoi QPath', link: '/why-qpath' },
              { text: 'Composants clés', link: '/components' },
              { text: "Cas d'usage", link: '/use-cases' },
              { text: 'Exemples', link: '/examples' },
              { text: 'Flash reasoning · web · LLM', link: '/flash-reasoning' },
              { text: 'PingPong reasoning', link: '/pingpong-reasoning' },
              { text: 'Plot reasoning', link: '/plot-reasoning' },
              { text: 'Outils (Tools)', link: '/tools' },
              { text: 'Provenance & revérification', link: '/fact-provenance' },
              { text: 'Démarrer', link: '/04-guides/getting-started' },
              { text: 'Architecture', link: '/04-guides/architecture' },
            ],
          },
        ],
        docFooter: { prev: 'Précédent', next: 'Suivant' },
        outline: { label: 'Sur cette page' },
      },
    },

    // ── English (sous /en/) ──
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      description: 'QPath — a content-addressable symbolic memory, in a single graph.',
      themeConfig: {
        nav: [
          { text: 'Overview', link: '/en/00-overview' },
          { text: 'Why QPath', link: '/en/why-qpath' },
          { text: 'Components', link: '/en/components' },
          { text: 'Use cases', link: '/en/use-cases' },
          { text: 'Examples', link: '/en/examples' },
          { text: 'Flash reasoning', link: '/en/flash-reasoning' },
          { text: 'PingPong reasoning', link: '/en/pingpong-reasoning' },
              { text: 'Plot reasoning', link: '/en/plot-reasoning' },
          { text: 'Tools', link: '/en/tools' },
          { text: 'Provenance', link: '/en/fact-provenance' },
          { text: 'Getting started', link: '/en/04-guides/getting-started' },
          { text: 'Architecture', link: '/en/04-guides/architecture' },
        ],
        sidebar: [
          {
            text: 'Documentation',
            items: [
              { text: 'Overview', link: '/en/00-overview' },
              { text: 'Why QPath', link: '/en/why-qpath' },
              { text: 'Key components', link: '/en/components' },
              { text: 'Use cases', link: '/en/use-cases' },
              { text: 'Examples', link: '/en/examples' },
              { text: 'Flash reasoning · web · LLM', link: '/en/flash-reasoning' },
              { text: 'PingPong reasoning', link: '/en/pingpong-reasoning' },
              { text: 'Plot reasoning', link: '/en/plot-reasoning' },
              { text: 'Tools', link: '/en/tools' },
              { text: 'Provenance & re-verification', link: '/en/fact-provenance' },
              { text: 'Getting started', link: '/en/04-guides/getting-started' },
              { text: 'Architecture', link: '/en/04-guides/architecture' },
            ],
          },
        ],
      },
    },
  },
});
