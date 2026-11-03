// Docusaurus builds this documentation into a GitHub Pages artifact.
module.exports = {
  title: 'ies',
  tagline: 'Photometric lighting tools for JavaScript and TypeScript',
  url: 'https://bhouston.github.io',
  baseUrl: '/ies/',
  organizationName: 'bhouston',
  projectName: 'ies',
  onBrokenLinks: 'throw',
  presets: [['classic', { docs: { routeBasePath: '/', sidebarPath: './sidebars.js' }, blog: false }]],
  themeConfig: {
    navbar: { title: 'ies', items: [{ href: 'https://github.com/bhouston/ies', label: 'GitHub', position: 'right' }] },
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
  },
};
