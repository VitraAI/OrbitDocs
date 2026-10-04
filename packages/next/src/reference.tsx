import type { OrbitDocsConfig } from '@orbitdocs/core';
import { allCodeSamples, ApiReference, type ExtraContent, plainText, type ReferenceContent, referenceSection, sectionFiles } from '@orbitdocs/ui';
import type { ComponentType } from 'react';

import { orbitMdxComponents } from './mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { hasPublicSpec, type LoadedApi, loadApi, loadApis, specUrl } from './apis';
import { accessAt, accessManifest, apiVariantParams, modelFor, splitApiParam } from './variants';

export interface ReferenceParams {
  api: string;
  slug?: string[];
}

/**
 * Every reference URL: `/reference/<api>/`, one per operation and `/models/`.
 * Each is the whole single-page reference, scrolled to its section, so every
 * operation is linkable, indexable and has its own title. Only that section
 * is in the URL's HTML; the others load from `/reference/<api>/sections/`.
 *
 * An API with operations only some readers may open also gets one copy per
 * reader variant (`/reference/<api>~<key>/…`, served by the access gate in
 * place of the canonical URL); see `variants.ts`.
 */
export async function referenceStaticParams(config: OrbitDocsConfig): Promise<ReferenceParams[]> {
  const out: ReferenceParams[] = [];
  for (const a of await loadApis(config)) {
    for (const param of [a.id, ...apiVariantParams(config, a.id)]) {
      // Every operation has its canonical page (showing what its own readers may see); a variant has the pages of its operations.
      const { model } = param === a.id ? a : await view(config, a, param);
      out.push({ api: param, slug: [] }, ...model.operations.map((o) => ({ api: param, slug: [o.slug] })), { api: param, slug: ['models'] });
    }
  }
  return out;
}

/**
 * The model one reference URL shows: the operations a reader who may open
 * that URL may see. The canonical index shows what every reader of the API
 * may see; a restricted operation's canonical page shows what readers of that
 * operation may see (servers that pick variants never serve it as is); a
 * variant shows what its readers may see.
 */
async function view(config: OrbitDocsConfig, api: LoadedApi, param: string, rest = '') {
  const manifest = accessManifest();
  const viewer = manifest ? accessAt(manifest, `/reference/${param}${rest ? `/${rest}` : ''}`) : null;
  return { api, model: modelFor(manifest, api.model, api.route, viewer) };
}

async function apiFor(config: OrbitDocsConfig, param: string): Promise<LoadedApi | undefined> {
  const { id, key } = splitApiParam(param);
  const apiConfig = config.apis.find((a) => a.id === id);
  if (!apiConfig || (key && !apiVariantParams(config, id).includes(param))) return undefined;
  return loadApi(config, apiConfig);
}

async function resolve(config: OrbitDocsConfig, params: ReferenceParams) {
  const loaded = await apiFor(config, params.api);
  if (!loaded) notFound();
  const slug = params.slug?.[0];
  const { model } = await view(config, loaded, params.api, slug);
  const op = slug ? model.operations.find((o) => o.slug === slug) : undefined;
  if (slug && !op && slug !== 'models') notFound();
  return { api: { ...loaded, model }, op, slug };
}

type ContentPosition = ExtraContent['position'];

/** The `reference/` collection in the docs app (MDX files keyed by `<api>/<operation>`). */
export interface ReferenceContentSource {
  getPages(): Array<{
    slugs: string[];
    data: { body: unknown; position?: string; replace?: boolean };
  }>;
}

const POSITIONS = new Set<ContentPosition>(['before-parameters', 'after-description', 'after-responses', 'aside']);

/** Renders `reference/<api>/…` MDX files into the slots the reference understands. */
function referenceContent(config: OrbitDocsConfig, apiId: string, source?: ReferenceContentSource): ReferenceContent | undefined {
  if (!source) return undefined;
  const components = orbitMdxComponents(config);
  const render = (page: ReturnType<ReferenceContentSource['getPages']>[number]) => {
    const MDX = page.data.body as ComponentType<{ components?: Record<string, unknown> }>;
    return (
      <div className="prose od-prose-mdx">
        <MDX components={components as Record<string, unknown>} />
      </div>
    );
  };
  const out: ReferenceContent = { groups: {}, operations: {} };
  for (const page of source.getPages()) {
    const [api, second, third] = page.slugs;
    if (api !== apiId) continue;
    if (!second) out.intro = { node: render(page), replace: page.data.replace };
    else if (second === '_groups' && third) out.groups![third] = render(page);
    else if (!third) {
      const position = POSITIONS.has(page.data.position as ContentPosition) ? (page.data.position as ContentPosition) : 'after-description';
      (out.operations![second] ??= []).push({ position, node: render(page) });
    }
  }
  return out;
}

export async function ReferencePage({
  config,
  params,
  content,
}: {
  config: OrbitDocsConfig;
  params: ReferenceParams;
  /** `reference/` MDX collection: per-operation, per-group and intro content. */
  content?: ReferenceContentSource;
}) {
  const { api, slug } = await resolve(config, params);
  // Links, sections and samples always use the canonical URLs: the gate picks the reader's variant.
  const base = `${config.output.basePath}${api.route}`;
  return (
    <ApiReference
      model={api.model}
      base={base}
      active={slug}
      specUrl={hasPublicSpec(api.id) ? specUrl(config, api.id) : undefined}
      openapiVersion={api.document.openapi}
      client={config.client.enabled ? config.client : false}
      personalize={Boolean(config.access)}
      content={referenceContent(config, api.id, content)}
      samplesUrl={`${config.output.basePath}/reference-samples/${api.id}.json`}
      sectionsUrl={`${base}/sections`}
    />
  );
}

export async function referenceMetadata(config: OrbitDocsConfig, params: ReferenceParams): Promise<Metadata> {
  const { api, op, slug } = await resolve(config, params);
  if (op) {
    return {
      title: `${op.summary} · ${api.model.title}`,
      description: plainText(op.description) || `${op.method.toUpperCase()} ${op.path}`,
    };
  }
  return {
    title: slug === 'models' ? `Models · ${api.model.title}` : api.model.title,
    description: plainText(api.model.description),
  };
}

/** `app/reference-samples/[file]/route.ts`: every operation's code samples, loaded when a reader picks another language. */
export async function referenceSamples(config: OrbitDocsConfig, file: string): Promise<Response> {
  const param = file.replace(/\.json$/, '');
  const api = await apiFor(config, param);
  if (!api) return new Response('Not found', { status: 404 });
  const manifest = accessManifest();
  const model = modelFor(manifest, api.model, api.route, manifest ? accessAt(manifest, `/reference-samples/${file}`) : null);
  return Response.json(await allCodeSamples(model));
}

export function referenceSamplesParams(config: OrbitDocsConfig) {
  return config.apis.flatMap((a) => [a.id, ...apiVariantParams(config, a.id)].map((p) => ({ file: `${p}.json` })));
}

/**
 * `app/reference/[api]/sections/[file]/route.ts`: the sections a reference
 * page doesn't carry, one file per operation group plus `models.json`, loaded
 * as the reader scrolls (and in the background). Under `/reference/<api>/`, so
 * private APIs keep the same access rule as their pages.
 */
export async function referenceSections(config: OrbitDocsConfig, params: { api: string; file: string }): Promise<Response> {
  const api = await apiFor(config, params.api);
  if (!api) return new Response('Not found', { status: 404 });
  const { model } = await view(config, api, params.api, `sections/${params.file}`);
  // Pages carry one code sample per operation (the rest are in /reference-samples/), so these do too.
  const body = await referenceSection(model, params.file, { lazySamples: true });
  return body ? Response.json(body) : new Response('Not found', { status: 404 });
}

export async function referenceSectionsParams(config: OrbitDocsConfig): Promise<Array<{ api: string; file: string }>> {
  const out: Array<{ api: string; file: string }> = [];
  for (const a of await loadApis(config)) {
    for (const param of [a.id, ...apiVariantParams(config, a.id)]) {
      const { model } = await view(config, a, param, 'sections');
      out.push(...sectionFiles(model).map((file) => ({ api: param, file })));
    }
  }
  return out;
}
