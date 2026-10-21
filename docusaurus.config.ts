import {themes as prismThemes, type PrismTheme} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type {PluginOptions} from '@easyops-cn/docusaurus-search-local';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Code blocks sit on the shared muted surface (src/css/custom.css), so the
// Prism themes keep their token colours but take the page token as background.
const withMutedBackground = (theme: PrismTheme): PrismTheme => ({
  ...theme,
  plain: {...theme.plain, backgroundColor: 'var(--muted)'},
});

const config: Config = {
  title: 'AudioSilo',
  tagline: 'Your audiobooks, your server - on every device.',
  favicon: 'img/favicon-32x32.png',

  future: {
    v4: true,
  },

  // Custom domain (docs.audiosilo.app) served via GitHub Pages. The domain is
  // pinned by static/CNAME; url is the canonical host and baseUrl is root.
  url: 'https://docs.audiosilo.app',
  baseUrl: '/',
  organizationName: 'KodeStar',
  projectName: 'audiosilo-docs',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  // Broken internal links / images fail the build - this is the docs gate.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },
  themes: [
    '@docusaurus/theme-mermaid',
    // Offline full-text search: the index is built at `docusaurus build` time,
    // so search only works on a built site (`npm run build && npm run serve`),
    // never under `npm start`.
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: ['users', 'developers'],
        docsDir: ['docs-users', 'docs-developers'],
        // Required: neither docs instance has the id 'default'.
        docsPluginIdForPreferredVersion: 'users',
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        searchBarShortcutHint: true,
        // Per-section search: a User Guide page searches the User Guide
        // index, a developer page the Developer Docs one. The dropdown's
        // footer link opens /search within that section (or everywhere when
        // the section has no hits); there the context selector switches to
        // the other section or "Everywhere". Pages outside either section
        // (the homepage, /search with no context) search everything.
        searchContextByPaths: [
          {label: 'User Guide', path: 'users'},
          {label: 'Developer Docs', path: 'developers'},
        ],
        useAllContextsWithNoSearchContext: true,
      } satisfies PluginOptions,
    ],
  ],

  presets: [
    [
      'classic',
      {
        // Two standalone docs instances (users + developers) are wired up as
        // plugins below; the preset's default docs/blog are disabled.
        docs: false,
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'users',
        path: 'docs-users',
        routeBasePath: 'users',
        sidebarPath: './sidebars-users.ts',
        editUrl: 'https://github.com/KodeStar/audiosilo-docs/tree/main/',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'developers',
        path: 'docs-developers',
        routeBasePath: 'developers',
        sidebarPath: './sidebars-developers.ts',
        editUrl: 'https://github.com/KodeStar/audiosilo-docs/tree/main/',
      },
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'AudioSilo',
      logo: {
        alt: 'AudioSilo logo',
        src: 'img/logo.svg',
        href: 'https://audiosilo.app',
        target: '_self',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'usersSidebar',
          docsPluginId: 'users',
          position: 'left',
          label: 'User Guide',
        },
        {
          type: 'docSidebar',
          sidebarId: 'developersSidebar',
          docsPluginId: 'developers',
          position: 'left',
          label: 'Developer Docs',
        },
        // Search first on the right, before GitHub and the theme toggle.
        {type: 'search', position: 'right'},
        {
          type: 'dropdown',
          label: 'GitHub',
          position: 'right',
          items: [
            {label: 'audiosilo-server', href: 'https://github.com/KodeStar/audiosilo-server'},
            {label: 'audiosilo-frontend', href: 'https://github.com/KodeStar/audiosilo-frontend'},
            {label: 'audiosilo-meta', href: 'https://github.com/KodeStar/audiosilo-meta'},
            {label: 'audiosilo-docs', href: 'https://github.com/KodeStar/audiosilo-docs'},
          ],
        },
      ],
    },
    footer: {
      links: [
        {
          title: 'Documentation',
          items: [
            {label: 'User Guide', to: '/users'},
            {label: 'Developer Docs', to: '/developers'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'Server', href: 'https://github.com/KodeStar/audiosilo-server'},
            {label: 'Player app', href: 'https://github.com/KodeStar/audiosilo-frontend'},
            {label: 'Metadata database', href: 'https://github.com/KodeStar/audiosilo-meta'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'audiosilo.app', href: 'https://audiosilo.app'},
            {label: 'Live demo', href: 'https://demo.audiosilo.app'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AudioSilo. Built with Docusaurus.`,
    },
    prism: {
      theme: withMutedBackground(prismThemes.jettwaveLight),
      darkTheme: withMutedBackground(prismThemes.jettwaveDark),
      additionalLanguages: ['bash', 'go', 'yaml', 'json', 'diff', 'docker'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
