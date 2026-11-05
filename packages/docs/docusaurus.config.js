// Docusaurus builds this documentation into a GitHub Pages artifact served at https://ies-tools.ben3d.ca.
// `pnpm generate` writes the CLI's OpenCLI document and the TypeDoc API pages before each build.
const clidocPlugin = require('@clidoc/docusaurus');

const url = process.env.SITE_URL ?? 'https://ies-tools.ben3d.ca';
const baseUrl = process.env.BASE_URL ?? '/';
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
  themes: [[require.resolve('@easyops-cn/docusaurus-search-local'), { hashed: true, indexBlog: false }]],
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
        { href: 'https://github.com/bhouston/ies-tools', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} ies-tools · MIT · Created with love ❤️ by <a href="https://ben3d.ca">Ben Houston</a> · Sponsored by <a href="https://landofassets.com">Land of Assets</a>`,
    },
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
  },
};
