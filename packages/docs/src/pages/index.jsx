import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import LiveLightViewer from '../components/LiveLightViewer';
import styles from './index.module.css';

const surfaces = [
  {
    label: 'CLI',
    title: 'In your terminal',
    body: 'Validate, inspect and convert files, serve a local preview, and export PNG renders and SVG charts.',
    code: 'npm install -g @ies-tools/cli\nies inspect luminaire.ies\nies view luminaire.ldt --open',
    href: '/docs/cli',
  },
  {
    label: 'React',
    title: 'In your React app',
    body: 'Drop in the 3D light viewer, polar and Cartesian intensity curves, isolux plots and an inspection panel.',
    code: 'import { LightViewer } from \'@ies-tools/viewer/react\';\n\n<LightViewer src="/lights/luminaire.ies" />',
    href: '/docs/react',
  },
  {
    label: 'Web component',
    title: 'On any page',
    body: 'One self-contained <light-viewer> element for plain HTML, Vue, Svelte or a CMS. No framework required.',
    code: '<script type="module" src="https://cdn.jsdelivr.net/npm/@ies-tools/viewer/dist/light-viewer.js"></script>\n<light-viewer src="/lights/luminaire.ies"></light-viewer>',
    href: '/docs/light-viewer',
  },
  {
    label: 'VS Code',
    title: 'In your editor',
    body: 'Open an .ies or .ldt file to see it lit, with validation and photometric statistics beside the preview.',
    code: 'code luminaire.ies',
    href: '/docs/vscode',
  },
];

const facts = [
  ['IES LM-63', '1986, 1991, 1995, 2002 and 2019 editions, with embedded tilt data'],
  ['EULUMDAT', '.ldt files, including alternative lamp configurations'],
  ['Validation', 'Stable diagnostic codes, a strict mode and JSON output for CI'],
  ['Conversion', 'IES ↔ LDT ↔ JSON, with stable codes for each conversion loss'],
  ['Statistics', 'Integrated flux, efficacy, peak intensity and beam and field angles'],
  ['Charts', 'Polar, Cartesian, 3D intensity topology and isolux ground plots'],
];

export default function Home() {
  return (
    <Layout
      title="Preview measured light. Build with photometric data"
      description="Parse, validate, convert and preview IES and EULUMDAT photometric files from the terminal, React, a web component or VS Code."
    >
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            <p className={styles.kicker}>IES · EULUMDAT · PHOTOMETRY</p>
            <h1>
              Preview measured light
              <br />
              <em>from its photometry.</em>
            </h1>
            <p className={styles.lead}>
              <code>ies-tools</code> reads the photometric files lighting manufacturers publish. It validates them,
              reports what they measure, converts between formats, and renders the light falling on a floor and wall
              from the measured intensity table.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/docs/quick-start">
                Get started <span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.secondary} to="/docs/cli/reference">
                CLI reference
              </Link>
            </div>
            <p className={styles.platform}>MIT · Node and browsers · Files never leave your machine</p>
          </div>
          <figure className={styles.live}>
            <LiveLightViewer charts="true" />
            <figcaption>
              Live: a track light from its IES file. Drag to orbit, gear for settings, tabs for charts.
            </figcaption>
          </figure>
        </div>
      </header>
      <main>
        <section className={styles.surfaces} aria-labelledby="surfaces-title">
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>ONE PARSER, FOUR SURFACES</p>
            <h2 id="surfaces-title">Use it wherever you work with light.</h2>
          </div>
          <div className={styles.grid}>
            {surfaces.map((surface) => (
              <article key={surface.label} className={styles.card}>
                <span className={styles.label}>{surface.label}</span>
                <h3>{surface.title}</h3>
                <p>{surface.body}</p>
                <pre>
                  <code>{surface.code}</code>
                </pre>
                <Link to={surface.href}>Read the guide →</Link>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.editor} aria-labelledby="editor-title">
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>VS CODE EXTENSION</p>
            <h2 id="editor-title">Open a file, see it lit.</h2>
            <p>
              Open an <code>.ies</code> or <code>.ldt</code> file to get the same live preview beside validation results
              and photometric statistics. The preview refreshes as you edit the source.
            </p>
            <Link to="/docs/vscode">Set up the extension →</Link>
          </div>
          <figure className={styles.shot}>
            <img
              src={useBaseUrl('/img/vscode-extension.gif')}
              alt="The IES light viewer in VS Code cycling through the 3D view and the polar, Cartesian, topology and isolux chart tabs, with validation and photometric statistics in a side panel"
              width="1280"
              height="800"
              loading="lazy"
            />
          </figure>
        </section>
        <section className={styles.callout}>
          <div>
            <p className={styles.kicker}>MEASURED, NOT GUESSED</p>
            <h2>The preview follows the data.</h2>
            <p>
              The viewer samples the Type C candela table in every direction, then applies inverse-square falloff and
              the receiving surface's cosine. A narrow spot, a wall washer and an asymmetric street light each look like
              what their files describe.
            </p>
            <p>
              It renders on your GPU with WebGL2. The CLI's PNG export confirms the browser reports a hardware renderer
              and rejects software rasterizers. The preview shows direct diffuse light; it does not simulate room
              interreflection or luminaire-body shadows.
            </p>
            <Link to="/docs/graphs">Explore the photometric graphs →</Link>
          </div>
          <dl className={styles.facts}>
            {facts.map(([term, detail]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={styles.library}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>A TYPED LIBRARY UNDERNEATH</p>
            <h2>Build your own lighting tools.</h2>
            <p>
              <code>@ies-tools/core</code> has no dependencies and runs in Node and the browser. Parse a file, sample
              intensity in any direction, and serialize to either format.
            </p>
            <Link to="/docs/api/core">Browse the API reference →</Link>
          </div>
          <pre className={styles.example}>
            <code>{`import { parsePhotometry, sampleIntensity, serializeLDT } from '@ies-tools/core';

// IES or LDT, detected from the content
const document = parsePhotometry(text);

// Candela at γ = 30°, C = 90°
sampleIntensity(document.profile, 30, 90);

const { value, warnings } = serializeLDT(document);`}</code>
          </pre>
        </section>
      </main>
    </Layout>
  );
}
