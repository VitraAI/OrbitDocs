import { refName, type ReferenceModel } from '@orbitdocs/openapi';
import { LuDownload as Download } from 'react-icons/lu';
import type { ReactNode } from 'react';

import {
  AuthCard,
  ClientLibrariesCard,
  InitialScroll,
  ModelsSlot,
  OperationSlot,
  ReferenceProvider,
  ReferenceSidebar,
  SectionsProvider,
  type SidebarApi,
  type SecuritySchemeView,
  ServerCard,
} from './client/index';
import { clientSeed } from '../api-client/seed';
import type { ClientDefaults } from '../api-client/settings';
import type { ExtraContent, OperationData } from './sections';
import { shikiCss } from './server/highlight';
import { markdown } from './server/markdown';
import { SAMPLE_LANGUAGES } from './server/languages';
import { modelHeads, modelsSections, operationData, operationHead } from './server/sections';

export interface ApiReferenceProps {
  model: ReferenceModel;
  /** URL of this reference, base path included (e.g. `/docs/reference/travel`). */
  base: string;
  /** Operation slug of the current URL; the page scrolls to it. */
  active?: string;
  /** URL of the raw spec for the download link. */
  specUrl?: string;
  /** OpenAPI version string shown as a badge. */
  openapiVersion?: string;
  /** Hide the Models section. */
  hideModels?: boolean;
  /** API client defaults (config `client`); false hides Test Request. */
  client?: ClientDefaults | false;
  /**
   * Sending is off for this API (config `send: false`): the reason shown on
   * the disabled Test Request button. The code samples stay.
   */
  sendDisabled?: string;
  /** Content from `reference/<api>/…` MDX files. */
  content?: ReferenceContent;
  /** Pre-fill credentials from the signed-in reader (`<base>/_auth/me`, private docs). */
  personalize?: boolean;
  /**
   * `/reference-samples/<api>.json`: pages then carry one code sample per
   * operation and load the other languages when the reader picks one.
   */
  samplesUrl?: string;
  /**
   * `<base>/sections` (served by `app/reference/[api]/sections/[file]`): the
   * page then renders only its own section and loads the others from there.
   * Without it, every section is in the page.
   */
  sectionsUrl?: string;
  /** The site's APIs: with more than one, the sidebar shows a dropdown to switch between them. */
  apis?: SidebarApi[];
}

export interface ReferenceContent {
  /** `index.mdx`: shown under the API description (or instead of it with `replace: true`). */
  intro?: { node: ReactNode; replace?: boolean };
  /** `_groups/<group-slug>.mdx`, keyed by group name or its slug. */
  groups?: Record<string, ReactNode>;
  /** `<operation-slug>.mdx`. */
  operations?: Record<string, ExtraContent[]>;
}

function schemeViews(model: ReferenceModel): SecuritySchemeView[] {
  return Object.entries(model.securitySchemes).map(([name, raw]) => {
    const s = raw as Record<string, string>;
    return { name, type: s.type ?? 'http', paramName: s.name, in: s.in, scheme: s.scheme, description: s.description };
  });
}

/**
 * A Scalar-style API reference: one scrolling page with a sidebar, every
 * operation in two columns (docs left, request and response samples right).
 * Rendered on the server; only the interactive parts hydrate. With
 * `sectionsUrl`, a page carries only its own operation in full (plus the
 * intro, group headers and an index of the rest); the other sections load
 * from `<sectionsUrl>/<file>.json` and render with the same component.
 */
export async function ApiReference({ model, base, active, specUrl, openapiVersion, hideModels, client, sendDisabled, content, personalize, samplesUrl, sectionsUrl, apis }: ApiReferenceProps) {
  const serverUrl = model.servers[0]?.url ?? '';
  const schemes = schemeViews(model);
  const languages = SAMPLE_LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
  const models = hideModels ? [] : modelHeads(model);
  const lazySamples = Boolean(samplesUrl);
  // With `sectionsUrl`, only the URL's own section is in the page; the others load from there.
  const inPage = (slug: string) => !sectionsUrl || slug === active;
  const data = new Map<string, OperationData>();
  for (const op of model.operations) {
    if (inPage(op.slug)) data.set(op.slug, await operationData(op, model, serverUrl, { lazySamples }));
  }
  // Models always carry their names and descriptions; their fields (often the
  // largest part of an API) load like the operations do, first on `/models/`.
  const modelData = models.length && !sectionsUrl ? modelsSections(model).models : undefined;
  const ownGroup = active === 'models' ? 'models' : model.groups.find((g) => g.operations.some((o) => o.slug === active))?.slug;
  const extrasFor = (slug: string): ExtraContent[] | undefined => content?.operations?.[slug];

  return (
    <ReferenceProvider apiId={model.id} servers={model.servers} schemes={schemes} languages={languages} seed={client === false || sendDisabled ? undefined : clientSeed(model)} sendDisabled={client === false ? undefined : sendDisabled} clientDefaults={client || undefined} meUrl={personalize ? `${base.replace(/\/reference\/[^/]+$/, '')}/_auth/me` : undefined} samplesUrl={samplesUrl}>
      <Sections url={sectionsUrl} files={[...model.groups.map((g) => g.slug), ...(models.length ? ['models'] : [])]} first={ownGroup}>
      <div className="od-reference">
        <style dangerouslySetInnerHTML={{ __html: await shikiCss() }} />
        <ReferenceSidebar
          title={model.title}
          base={base}
          apis={apis}
          apiId={model.id}
          initial={active ?? 'introduction'}
          hasModels={models.length > 0}
          groups={model.groups.map((g) => ({
            name: g.name,
            slug: g.slug,
            items: g.operations.map((o) => ({ slug: o.slug, title: o.summary, method: o.method, path: o.path, deprecated: o.deprecated })),
          }))}
        />
        <main className="od-reference-content">
          <section className="od-intro" data-od-section="introduction">
            <div className="od-columns">
              <div className="od-column-main">
                <div className="od-badges">
                  <span className="od-pill">v{model.version.replace(/^v/, '')}</span>
                  {openapiVersion ? <span className="od-pill">OpenAPI {openapiVersion}</span> : null}
                </div>
                <h1 className="od-title">{model.title}</h1>
                {specUrl ? (
                  <a className="od-download" href={specUrl} download>
                    <Download size={14} /> Download OpenAPI Document
                  </a>
                ) : null}
                {model.description && !content?.intro?.replace ? (
                  <div className="od-prose od-lead" dangerouslySetInnerHTML={{ __html: markdown(model.description) }} />
                ) : null}
                {content?.intro ? <div className="od-extra od-prose-mdx">{content.intro.node}</div> : null}
              </div>
              <div className="od-column-aside">
                <div className="od-stack">
                  <ServerCard />
                  {schemes.length ? <AuthCard /> : null}
                  <ClientLibrariesCard />
                </div>
              </div>
            </div>
          </section>

          {model.groups.map((g) => (
            <div key={g.slug} className="od-group">
              {g.name ? (
                <section className="od-tag" id={g.slug}>
                  <div className="od-columns">
                    <div className="od-column-main">
                      <h2 className="od-tag-title">{g.name}</h2>
                      {g.description ? <div className="od-prose" dangerouslySetInnerHTML={{ __html: markdown(g.description) }} /> : null}
                      {content?.groups?.[g.name] ?? content?.groups?.[g.slug.replace(/^tag-/, '')] ? (
                        <div className="od-extra od-prose-mdx">{content?.groups?.[g.name] ?? content?.groups?.[g.slug.replace(/^tag-/, '')]}</div>
                      ) : null}
                    </div>
                    <div className="od-column-aside">
                      <div className="od-card">
                        <div className="od-card-header">Operations</div>
                        <ul className="od-endpoint-list">
                          {g.operations.map((o) => (
                            <li key={o.slug}>
                              <a href={`${base}/${o.slug}/`}>
                                <span className={`od-method od-method-${o.method}`}>{o.method.toUpperCase()}</span>
                                <span className="od-path">{o.path}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
              {g.operations.map((op) => (
                <OperationSlot
                  key={op.slug}
                  head={operationHead(op, model)}
                  file={g.slug}
                  href={`${base}/${op.slug}/`}
                  data={data.get(op.slug)}
                  extras={extrasFor(op.slug)}
                />
              ))}
            </div>
          ))}

          {models.length ? <ModelsSlot heads={models} data={modelData} /> : null}
        </main>
        <InitialScroll slug={active} />
      </div>
      </Sections>
    </ReferenceProvider>
  );
}

/** Lazy loading of the sections a page doesn't carry (none without `url`). */
function Sections({ url, files, first, children }: { url?: string; files: string[]; first?: string; children: ReactNode }) {
  return url ? (
    <SectionsProvider url={url} files={files} first={first}>
      {children}
    </SectionsProvider>
  ) : (
    <>{children}</>
  );
}

export { refName };
