import { buildReferenceModel } from '@vitra-ai/orbitdocs-openapi';
import { describe, expect, it } from 'vitest';

import { highlight, shikiCss } from './highlight';
import { modelHeads, operationData, referenceSection, sectionFiles } from './sections';

const doc = {
  openapi: '3.1.0',
  info: { title: 'Pets', version: '1.0.0' },
  servers: [{ url: 'https://api.example' }],
  tags: [{ name: 'Pets' }, { name: 'Stores' }],
  paths: {
    '/pets/{id}': {
      get: {
        tags: ['Pets'],
        summary: 'Get a pet',
        description: 'Returns one pet. Uses <b>HTML</b> & "quotes".',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: "o'malley",
          },
        ],
        responses: {
          '200': {
            description: 'The pet',
            headers: {
              'X-Rate-Limit': { schema: { type: 'integer' }, description: 'Left this minute' },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Pet' },
                example: { id: 'p1', name: 'Rex' },
              },
            },
          },
          '404': { description: 'Not found' },
        },
      },
    },
    '/stores': {
      get: {
        tags: ['Stores'],
        summary: 'List stores',
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Id <1>' },
          name: { type: 'string', enum: ['Rex', "D'Artagnan"] },
        },
      },
    },
  },
};

const model = buildReferenceModel(doc as never, 'pets');
const op = model.operations.find((o) => o.slug === 'get-a-pet')!;

describe('reference sections', () => {
  it('lists one file per group plus models', () => {
    expect(sectionFiles(model)).toEqual([
      ...model.groups.map((g) => `${g.slug}.json`),
      'models.json',
    ]);
  });

  it('serves a group file with every operation of the group, and nothing for unknown files', async () => {
    const pets = await referenceSection(model, `${model.groups[0]!.slug}.json`, {
      lazySamples: true,
    });
    expect(Object.keys((pets as { operations: object }).operations)).toEqual(['get-a-pet']);
    expect(await referenceSection(model, 'nope.json')).toBeUndefined();
    expect(await referenceSection(model, 'models')).toBeUndefined();
    const models = (await referenceSection(model, 'models.json')) as {
      models: Record<string, string>;
    };
    expect(Object.keys(models.models)).toEqual(modelHeads(model).map((m) => m.name));
    expect(models.models.Pet).toContain('od-field-name');
  });

  it('builds an operation as data, escaping text and carrying one sample when lazy', async () => {
    const data = await operationData(op, model, 'https://api.example', { lazySamples: true });
    expect(data.samples).toHaveLength(1);
    expect(data.sampleOptions!.length).toBeGreaterThan(1);
    expect(data.requestId).toBe('pets:get-a-pet');
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0]).toContain('Path Parameters');
    // Text from the spec is escaped; attributes use single quotes (cheaper inside JSON).
    expect(data.blocks[0]).toContain('o&#39;malley');
    expect(data.blocks[0]).not.toContain('"');
    const ok = data.responses.find((r) => r.status === '200')!;
    expect(ok.mediaType).toBe('application/json');
    expect(ok.schemaHtml).toContain('Id &lt;1&gt;');
    expect(ok.schemaHtml).toContain('D&#39;Artagnan');
    expect(ok.headersHtml).toContain('X-Rate-Limit');
    expect(ok.html).toBeDefined();
    const missing = data.responses.find((r) => r.status === '404')!;
    expect(missing.schemaHtml).toBeUndefined();
    expect(missing.headersHtml).toBeUndefined();
  });
});

describe('highlight', () => {
  it('colours tokens with classes the generated CSS defines', async () => {
    const html = await highlight(
      'curl https://x --header "a: b" --data \'{"n":1}\'',
      'shellscript',
    );
    expect(html).not.toMatch(/<span[^>]*--shiki-(light|dark):/);
    const css = await shikiCss();
    const used = new Set(
      [...html.matchAll(/class=['"]?([a-z0-9 ]+)/g)]
        .flatMap((m) => m[1]!.split(' '))
        .filter((c) => /^[lcd]\d+$/.test(c)),
    );
    expect(used.size).toBeGreaterThan(0);
    for (const c of used) expect(css).toContain(`.shiki .${c}{`);
  });
});
