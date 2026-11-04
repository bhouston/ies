// Docusaurus builds this documentation into a GitHub Pages artifact served at https://ies-tools.ben3d.ca.
// `pnpm generate` writes the CLI's OpenCLI document and the TypeDoc API pages before each build.
const clidocPlugin = require('@clidoc/docusaurus');

module.exports = {
  title: 'ies-tools',
  tagline: 'Preview measured light. Build with photometric data.',
  url: process.env.SITE_URL ?? 'https://ies-tools.ben3d.ca',
  baseUrl: process.env.BASE_URL ?? '/',
  favicon: 'img/icon.png',
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
    navbar: {
      title: 'ies-tools',
      logo: { alt: 'ies-tools polar candela chart', src: 'img/icon.png' },
      items: [
        { to: '/docs/quick-start', label: 'Get started', position: 'left' },
        { to: '/docs/cli', label: 'CLI', position: 'left' },
        { to: '/docs/react', label: 'React', position: 'left' },
        { to: '/docs/light-viewer', label: '<light-viewer>', position: 'left' },
        {
          type: 'dropdown',
          label: 'API',
          position: 'left',
          items: [
            { to: '/docs/api/core', label: '@ies-tools/core' },
            { to: '/docs/api/react', label: '@ies-tools/viewer/react' },
          ],
        },
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
