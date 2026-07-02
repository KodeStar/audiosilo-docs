import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function Hero() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className="container">
        <img src={useBaseUrl('/img/logo.svg')} alt="" className={styles.heroLogo} />
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title} Documentation
        </Heading>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
        <p className={styles.heroBlurb}>
          AudioSilo is a self-hosted audiobook platform: a fast, internet-safe Go
          server; a player app for web, iOS and Android; and a desktop manager for
          organizing your library and backing up your Audible collection.
        </p>
      </div>
    </header>
  );
}

const tracks = [
  {
    title: 'User Guide',
    to: '/users',
    description:
      'Install the server, organize your audiobooks, invite your household, ' +
      'and listen anywhere — web, phone, or offline. No programming required.',
    cta: 'Get started',
  },
  {
    title: 'Developer Docs',
    to: '/developers',
    description:
      'Architecture, the cross-repo contract, the HTTP API, playback internals, ' +
      'and how to contribute changes across the three repositories.',
    cta: 'Dive in',
  },
];

function Tracks() {
  return (
    <main className={styles.tracks}>
      <div className="container">
        <div className="row">
          {tracks.map((t) => (
            <div key={t.to} className="col col--6">
              <div className={styles.trackCard}>
                <Heading as="h2">{t.title}</Heading>
                <p>{t.description}</p>
                <Link className="button button--primary button--lg" to={t.to}>
                  {t.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout description="Documentation for AudioSilo — the self-hosted audiobook server, player app, and desktop manager.">
      <Hero />
      <Tracks />
    </Layout>
  );
}
