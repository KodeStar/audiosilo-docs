import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

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
  themes: ['@docusaurus/theme-mermaid'],

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
      respectPrefersColorScheme: false,
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
        {
          type: 'dropdown',
          label: 'GitHub',
          position: 'right',
          items: [
            {label: 'audiosilo-server', href: 'https://github.com/KodeStar/audiosilo-server'},
            {label: 'audiosilo-frontend', href: 'https://github.com/KodeStar/audiosilo-frontend'},
            {label: 'audiosilo-manager', href: 'https://github.com/KodeStar/audiosilo-manager'},
            {label: 'audiosilo-docs', href: 'https://github.com/KodeStar/audiosilo-docs'},
          ],
        },
      ],
    },
    footer: {
      style: 'dark',
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
            {label: 'Desktop manager', href: 'https://github.com/KodeStar/audiosilo-manager'},
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
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'go', 'yaml', 'json', 'diff', 'docker'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
