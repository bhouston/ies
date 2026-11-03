// Docusaurus builds this documentation into a GitHub Pages artifact served at https://ies.ben3d.ca.
// `pnpm generate` writes the CLI's OpenCLI document and the TypeDoc API pages before each build.
const clidocPlugin = require('@clidoc/docusaurus');

module.exports = {
  title: 'ies',
  tagline: 'See how a luminaire really lights a room.',
  url: process.env.SITE_URL ?? 'https://ies.ben3d.ca',
  baseUrl: process.env.BASE_URL ?? '/',
  organizationName: 'bhouston',
  projectName: 'ies',
  onBrokenLinks: 'throw',
  markdown: { format: 'md' },
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
    navbar: {
      title: 'ies',
      items: [
        { to: '/docs', label: 'Docs', position: 'left' },
        { to: '/docs/cli/reference', label: 'CLI', position: 'left' },
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
        { href: 'https://github.com/bhouston/ies', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} ies · MIT · Created with love ❤️ by <a href="https://ben3d.ca">Ben Houston</a> · Sponsored by <a href="https://landofassets.com">Land of Assets</a>`,
    },
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
  },
};
