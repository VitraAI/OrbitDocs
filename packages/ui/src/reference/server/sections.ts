import {
  CONTENT_EXTENSION,
  deref,
  type OperationContent,
  type OperationModel,
  type ReferenceModel,
  schemaRef,
} from '@vitra-ai/orbitdocs-openapi';

import type {
  GroupSectionsFile,
  ModelHead,
  ModelsSectionsFile,
  OperationData,
  OperationHead,
  ResponseData,
} from '../sections';
import { operationMarkdown } from './export-markdown';
import { esc, fieldHtml, schemaFieldsHtml } from './fields';
import { highlight } from './highlight';
import { markdown } from './markdown';
import { codeSamples } from './snippets';

const PARAM_GROUPS = [
  ['path', 'Path Parameters'],
  ['query', 'Query Parameters'],
  ['header', 'Headers'],
  ['cookie', 'Cookies'],
] as const;

/** Rough rendered height of an operation (two columns on desktop), for its placeholder. */
function estimate(op: OperationModel, model: ReferenceModel): number {
  const body = op.requestBody?.content[0]?.schema;
  const props = body ? Object.keys(deref(body, model.schemas).properties ?? {}).length : 0;
  const main =
    180 +
    (op.description ? 60 : 0) +
    op.parameters.length * 70 +
    props * 70 +
    60 +
    op.responses.length * 46;
  return Math.max(640, Math.min(main, 2400));
}

export function operationHead(op: OperationModel, model: ReferenceModel): OperationHead {
  return {
    slug: op.slug,
    method: op.method,
    path: op.path,
    summary: op.summary,
    deprecated: op.deprecated || undefined,
    stability: op.stability,
    estimate: estimate(op, model),
  };
}

/**
 * Everything one operation's section shows, as serializable data: static
 * parts as HTML, interactive parts (samples, response examples) as values.
 */
export async function operationData(
  op: OperationModel,
  model: ReferenceModel,
  serverUrl: string,
  { lazySamples = false }: { lazySamples?: boolean } = {},
): Promise<OperationData> {
  const schemas = model.schemas;
  const blocks: string[] = [];
  for (const [where, title] of PARAM_GROUPS) {
    const params = op.parameters.filter((p) => p.in === where);
    if (!params.length) continue;
    const rows = params.map((p) =>
      fieldHtml({
        name: p.name,
        schema: p.schema,
        required: p.required,
        description: p.description,
        deprecated: p.deprecated,
        example: p.example,
        schemas,
      }),
    );
    blocks.push(
      `<h4 class='od-block-title'>${title}</h4><div class='od-fields'>${rows.join('')}</div>`,
    );
  }
  const body = op.requestBody?.content[0];
  if (body) {
    let html = `<h4 class='od-block-title'>Body${op.requestBody?.required ? "<span class='od-flag od-flag-required'>required</span>" : ''}<span class='od-media-type'>${esc(body.mediaType)}</span></h4>`;
    if (op.requestBody?.description)
      html += `<div class='od-prose od-muted'>${markdown(op.requestBody.description)}</div>`;
    html += schemaFieldsHtml({ schema: body.schema, schemas, direction: 'request' });
    blocks.push(html);
  }

  const everySample = await codeSamples(op, model, serverUrl);
  // The page carries one sample; the menu still lists every language.
  const first = everySample.find((x) => !x.id.startsWith('x-')) ?? everySample[0];
  const responses: ResponseData[] = await Promise.all(
    op.responses.map(async (r) => {
      const c = r.content[0];
      const code = c?.example !== undefined ? JSON.stringify(c.example, null, 2) : undefined;
      return {
        status: r.status,
        description: r.description,
        mediaType: c?.mediaType,
        code,
        html: code ? await highlight(code, 'json') : undefined,
        schemaHtml: c?.schema
          ? schemaFieldsHtml({ schema: c.schema, schemas, direction: 'response' }) || undefined
          : undefined,
        headersHtml: r.headers.length
          ? `<div class='od-subtitle'>Headers</div><div class='od-fields'>${r.headers
              .map((h) =>
                fieldHtml({ name: h.name, schema: h.schema, description: h.description, schemas }),
              )
              .join('')}</div>`
          : undefined,
      };
    }),
  );

  return {
    ...operationHead(op, model),
    secured: op.security.some((r) => Object.keys(r).length > 0),
    markdown: operationMarkdown(op, model),
    descriptionHtml: op.description ? markdown(op.description) : undefined,
    blocks,
    inline: ((op.extensions[CONTENT_EXTENSION] as OperationContent[] | undefined) ?? []).map(
      (c) => ({
        position: c.position ?? 'after-description',
        html: markdown(c.markdown),
      }),
    ),
    samples: lazySamples && first ? [first] : everySample,
    sampleOptions: lazySamples ? everySample.map(({ id, label }) => ({ id, label })) : undefined,
    requestId: `${model.id}:${op.slug}`,
    responses,
  };
}

/** Named object schemas shown under Models (every one but the shared error body). */
export function modelHeads(model: ReferenceModel): ModelHead[] {
  return Object.entries(model.schemas)
    .filter(([name, s]) => name !== 'ErrorResponse' && (s.properties || s.allOf || s.enum))
    .map(([name, s]) => ({ name, description: s.description }));
}

/** `sections/models.json`. */
export function modelsSections(model: ReferenceModel): ModelsSectionsFile {
  return {
    models: Object.fromEntries(
      modelHeads(model).map(({ name }) => [
        name,
        schemaFieldsHtml({ schema: schemaRef(name), schemas: model.schemas }),
      ]),
    ),
  };
}

/** `sections/<group-slug>.json`: every operation of a group. */
export async function groupSections(
  model: ReferenceModel,
  groupSlug: string,
  options: { lazySamples?: boolean } = {},
): Promise<GroupSectionsFile | undefined> {
  const group = model.groups.find((g) => g.slug === groupSlug);
  if (!group) return undefined;
  const serverUrl = model.servers[0]?.url ?? '';
  const operations: Record<string, OperationData> = {};
  for (const op of group.operations)
    operations[op.slug] = await operationData(op, model, serverUrl, options);
  return { operations };
}

/** File names under `sections/`: one per group, plus `models.json`. */
export function sectionFiles(model: ReferenceModel): string[] {
  return [...model.groups.map((g) => `${g.slug}.json`), 'models.json'];
}

/** The body of `sections/<file>`, or undefined for an unknown file. */
export async function referenceSection(
  model: ReferenceModel,
  file: string,
  options: { lazySamples?: boolean } = {},
) {
  if (file === 'models.json') return modelsSections(model);
  if (!file.endsWith('.json')) return undefined;
  return groupSections(model, file.slice(0, -'.json'.length), options);
}
