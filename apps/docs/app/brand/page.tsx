import { statSync } from 'node:fs';
import { join } from 'node:path';

import { LandingLayout, Section } from '@orbitdocs/next';
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LuDownload, LuFileCode2, LuFilm, LuImage } from 'react-icons/lu';

import { BrandCapture, BrandShowcase } from '@/components/brand-showcase';
import { orbit } from '@/lib/orbit';

export const metadata: Metadata = {
  title: 'Brand',
  description: 'The OrbitDocs logo: animated and static, as SVG, video, WebP and GIF.',
};

interface BrandFile {
  file: string;
  label: string;
}

const GROUPS: { title: string; icon: ReactNode; note: string; files: BrandFile[] }[] = [
  {
    title: 'Vector',
    icon: <LuFileCode2 size={18} aria-hidden />,
    note: 'Static SVG, crisp at any size. The wordmark is converted to outlines.',
    files: [
      { file: 'orbitdocs-logo-light.svg', label: 'Logo, for light backgrounds' },
      { file: 'orbitdocs-logo-dark.svg', label: 'Logo, for dark backgrounds' },
      { file: 'orbitdocs-mark.svg', label: 'Mark' },
    ],
  },
  {
    title: 'Video',
    icon: <LuFilm size={18} aria-hidden />,
    note: 'The intro and a short idle, 1920 × 1080 at 60 fps.',
    files: [
      { file: 'orbitdocs-logo-animated-light.mp4', label: 'Light, H.264' },
      { file: 'orbitdocs-logo-animated-dark.mp4', label: 'Dark, H.264' },
      { file: 'orbitdocs-logo-animated-light.webm', label: 'Light, VP9' },
      { file: 'orbitdocs-logo-animated-dark.webm', label: 'Dark, VP9' },
    ],
  },
  {
    title: 'Animated image',
    icon: <LuImage size={18} aria-hidden />,
    note: 'For READMEs, slides and chat: 800 px wide logo, 512 px square mark.',
    files: [
      { file: 'orbitdocs-logo-animated-light.webp', label: 'Logo, light, WebP' },
      { file: 'orbitdocs-logo-animated-dark.webp', label: 'Logo, dark, WebP' },
      { file: 'orbitdocs-logo-animated-light.gif', label: 'Logo, light, GIF' },
      { file: 'orbitdocs-logo-animated-dark.gif', label: 'Logo, dark, GIF' },
      { file: 'orbitdocs-mark-animated.webp', label: 'Mark, WebP' },
      { file: 'orbitdocs-mark-animated.gif', label: 'Mark, GIF' },
    ],
  },
];

/** The file's size, read at build time; null when it is not there. */
function fileSize(file: string): string | null {
  try {
    const bytes = statSync(join(process.cwd(), 'public', 'brand', file)).size;
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return null;
  }
}

const USAGE = `import { AnimatedLogo } from '@/components/animated-logo';

// Full logo, plays once on mount, "Orbit" follows the .dark class.
<AnimatedLogo variant="full" size={40} />

// Mark only, starts when scrolled into view, keeps a gentle idle loop.
<AnimatedLogo variant="mark" size={96} play="inView" loop />

// Fixed colours, e.g. on an always-dark hero.
<AnimatedLogo variant="full" theme="dark" size={72} />`;

const PROPS: { name: string; type: string; text: string }[] = [
  {
    name: 'variant',
    type: "'full' | 'mark'",
    text: 'The mark with the wordmark (default), or the mark alone.',
  },
  {
    name: 'theme',
    type: "'light' | 'dark' | 'auto'",
    text: '"Orbit" in navy or near-white. auto (default) follows the .dark class.',
  },
  {
    name: 'loop',
    type: 'boolean',
    text: 'After the intro, keep the satellite orbiting, the page floating and the highlights shimmering.',
  },
  {
    name: 'size',
    type: 'number',
    text: 'Height in px (default 48); the width follows the aspect ratio.',
  },
  {
    name: 'play',
    type: "'mount' | 'inView'",
    text: 'Start on mount (default) or the first time it scrolls into view.',
  },
  {
    name: 'timeline',
    type: 'MotionValue<number>',
    text: 'Drive it yourself in seconds, to scrub or record frames.',
  },
];

export default function BrandPage() {
  const base = orbit.output.basePath;
  return (
    <LandingLayout config={orbit}>
      <main className="od-landing">
        <BrandShowcase />

        <Section
          eyebrow="Files"
          title="Downloads"
          description="Everything is rendered from the same vector source as the component above. Prefer the SVG wherever it fits."
        >
          <div className="bp-downloads">
            {GROUPS.map((group) => (
              <div key={group.title} className="bp-download-card">
                <div className="bp-download-head">
                  <span className="od-feature-icon">{group.icon}</span>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.note}</p>
                  </div>
                </div>
                <ul>
                  {group.files.map(({ file, label }) => {
                    const size = fileSize(file);
                    if (!size) return null;
                    return (
                      <li key={file}>
                        <a href={`${base}/brand/${file}`} download>
                          <span className="bp-download-label">{label}</span>
                          <span className="bp-download-meta">
                            {file.split('.').pop()?.toUpperCase()} · {size}
                          </span>
                          <LuDownload size={15} aria-hidden className="bp-download-icon" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="React"
          title="Use it in your app"
          description="A client component built on Motion. With reduced motion it shows the logo at rest."
        >
          <div className="bp-usage">
            <ServerCodeBlock code={USAGE} lang="tsx" />
            <dl className="bp-props">
              {PROPS.map((prop) => (
                <div key={prop.name}>
                  <dt>
                    <code>{prop.name}</code>
                    <span>{prop.type}</span>
                  </dt>
                  <dd>{prop.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      </main>
      <BrandCapture />
    </LandingLayout>
  );
}
