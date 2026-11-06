// Docusaurus builds this documentation into a GitHub Pages artifact served at https://ies-tools.ben3d.ca.
// `pnpm generate` writes the CLI's OpenCLI document and the TypeDoc API pages before each build.
const clidocPlugin = require('@clidoc/docusaurus');

const url = process.env.SITE_URL ?? 'https://ies-tools.ben3d.ca';
const baseUrl = process.env.BASE_URL ?? '/';
const githubIcon =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:block"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';

const link = (attributes) => ({ tagName: 'link', attributes });
// Raw head tags: `themeConfig.metadata` goes through Helmet, which keeps one tag per name and would drop a theme-color.
const themeColor = (content, scheme) => ({
  tagName: 'meta',
  attributes: { name: 'theme-color', content, media: `(prefers-color-scheme: ${scheme})` },
});

module.exports = {
  title: 'ies-tools',
  tagline: 'Preview measured light. Build with photometric data.',
  url,
  baseUrl,
  favicon: 'img/icon.png',
  headTags: [
    link({ rel: 'icon', type: 'image/png', sizes: '32x32', href: `${baseUrl}img/favicon-32x32.png` }),
    link({ rel: 'apple-touch-icon', sizes: '180x180', href: `${baseUrl}img/apple-touch-icon.png` }),
    link({ rel: 'manifest', href: `${baseUrl}site.webmanifest` }),
    themeColor('#fcfaf6', 'light'),
    themeColor('#0e0d0b', 'dark'),
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'ies-tools',
        url: new URL(baseUrl, url).href,
        description: 'Parse, validate, convert and preview IES and EULUMDAT photometric files.',
      }),
    },
  ],
  organizationName: 'bhouston',
  projectName: 'ies-tools',
  onBrokenLinks: 'throw',
  markdown: { format: 'detect' },
  presets: [
    [
      'classic',
      {
        docs: { routeBasePath: 'docs', sidebarPath: './sidebars.js' },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      },
    ],
  ],
  plugins: [[clidocPlugin, { input: 'ies.opencli.json', outputDir: 'docs/cli-reference', basePath: '/cli/reference' }]],
  themeConfig: {
    image: 'img/social-card.png',
    metadata: [
      { property: 'og:site_name', content: 'ies-tools' },
      { name: 'twitter:site', content: '@BenHouston3D' },
    ],
    navbar: {
      title: 'ies-tools',
      logo: { alt: 'ies-tools polar candela chart', src: 'img/icon.png' },
      items: [
        { to: '/docs/quick-start', label: 'Get started', position: 'left' },
        { to: '/docs/cli', label: 'CLI', position: 'left' },
        { to: '/docs/vscode', label: 'VS Code Extension', position: 'left' },
        { to: '/docs/core', label: 'Library', position: 'left' },
        { to: '/docs/light-viewer', label: '<light-viewer>', position: 'left' },
        {
          href: 'https://github.com/bhouston/ies-tools',
          html: githubIcon,
          'aria-label': 'GitHub repository',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright:
        'Made with ❤️ by <a href="https://ben3d.ca">Ben Houston</a>. Sponsored by <a href="https://landofassets.com">Land of Assets</a>',
    },
    colorMode: { defaultMode: 'dark', disableSwitch: true, respectPrefersColorScheme: true },
  },
};
