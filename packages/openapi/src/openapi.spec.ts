import { describe, expect, it } from 'vitest';

import {
  BINARY_EXAMPLE,
  buildReferenceModel,
  DanglingReferenceError,
  exampleFor,
  filterDocument,
  findDocumentationGaps,
  formFields,
  isBinarySchema,
  loadDocument,
  ORBIT_EXTENSION,
  pruneDocument,
  pruneModel,
  slugify,
  stableStringify,
  typeLabel,
  type Document,
} from './index';

const full = (): Document => ({
  openapi: '3.1.0',
  info: { title: 'Full', version: '1' },
  tags: [{ name: 'Bookings', description: 'Book trips.' }, { name: 'Internal' }],
  security: [{ bearer: [] }],
  paths: {
    '/bookings': {
      post: {
        operationId: 'BookingsController_create',
        summary: 'create',
        tags: ['Bookings'],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBooking' } } } },
        responses: { '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } } },
        [ORBIT_EXTENSION]: { group: 'Bookings', title: 'Create a booking', order: 2 },
      },
      get: {
        operationId: 'BookingsController_list',
        tags: ['Bookings'],
        responses: { '200': { description: 'OK' } },
        [ORBIT_EXTENSION]: { group: 'Bookings', title: 'List bookings', order: 1 },
      },
    },
    '/bookings/{id}': {
      get: {
        operationId: 'BookingsController_get',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
        [ORBIT_EXTENSION]: { group: 'Bookings', title: 'Get a booking', hidden: true },
      },
    },
    '/admin/reset': {
      post: { operationId: 'AdminController_reset', tags: ['Internal'], responses: { '204': {} } },
    },
  },
  components: {
    schemas: {
      CreateBooking: { type: 'object', properties: { seat: { type: 'string', example: '12A' } } },
      Booking: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, passenger: { $ref: '#/components/schemas/Passenger' } } },
      Passenger: { type: 'object', properties: { name: { type: 'string' } } },
      Unused: { type: 'object' },
    },
  },
});

describe('filterDocument', () => {
  it('keeps only marked, non-hidden operations (opt-in)', () => {
    const doc = filterDocument(full());
    expect(Object.keys(doc.paths)).toEqual(['/bookings']);
    expect(Object.keys(doc.paths['/bookings']!).sort()).toEqual(['get', 'post']);
    expect(doc.tags).toEqual([{ name: 'Bookings', description: 'Book trips.' }]);
  });

  it('opt-out keeps unmarked operations but not hidden ones', () => {
    const doc = filterDocument(full(), { mode: 'opt-out' });
    expect(Object.keys(doc.paths).sort()).toEqual(['/admin/reset', '/bookings']);
  });

  it('applies markers and readable operationIds', () => {
    const op = filterDocument(full()).paths['/bookings']!.post!;
    expect(op.summary).toBe('Create a booking');
    expect(op.operationId).toBe('create-a-booking');
    expect(op['x-orbitdocs-handler']).toBe('BookingsController_create');
    expect(op['x-orbitdocs-order']).toBe(2);
    expect(op[ORBIT_EXTENSION]).toBeUndefined();
  });

  it('adds standard errors and the error schema', () => {
    const doc = filterDocument(full());
    const post = doc.paths['/bookings']!.post!;
    expect(Object.keys(post.responses!)).toEqual(['201', '400', '401', '403', '500']);
    expect(post.responses!['201']!.description).toBe('Created');
    expect(doc.components!.schemas!.ErrorResponse).toBeDefined();
  });

  it('prunes unused schemas and keeps transitive ones', () => {
    const names = Object.keys(filterDocument(full()).components!.schemas!);
    expect(names).toEqual(['Booking', 'CreateBooking', 'ErrorResponse', 'Passenger']);
  });

  it('throws on dangling references', () => {
    const d = full();
    delete d.components!.schemas!.Passenger;
    expect(() => filterDocument(d)).toThrow(DanglingReferenceError);
  });

  it('replaces security when configured', () => {
    const doc = filterDocument(full(), {
      securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
      security: ['apiKey'],
    });
    expect(doc.paths['/bookings']!.get!.security).toEqual([{ apiKey: [] }]);
    expect(doc.components!.securitySchemes!.apiKey).toBeDefined();
  });
});

describe('filterDocument details', () => {
  it('keeps the doc comment when a title is set', () => {
    const d = full();
    d.paths['/bookings']!.post!.summary = 'Books seats on a flight.';
    const op = filterDocument(d).paths['/bookings']!.post!;
    expect(op.summary).toBe('Create a booking');
    expect(op.description).toBe('Books seats on a flight.');
  });
  it('merges header parameters case-insensitively', () => {
    const d = full();
    d.paths['/bookings']!.post!.parameters = [
      { name: 'idempotency-key', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'Idempotency-Key', in: 'header', required: false, description: 'Key.', schema: { type: 'string', example: 'k' } },
    ];
    const params = filterDocument(d).paths['/bookings']!.post!.parameters!;
    expect(params).toEqual([
      { name: 'Idempotency-Key', in: 'header', required: false, description: 'Key.', schema: { type: 'string', example: 'k' } },
    ]);
  });
  it('removes the parameters omitParameters names, header names in any case', () => {
    const d = full();
    d.paths['/bookings']!.post!.parameters = [
      { name: 'organizationId', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'organizationId', in: 'query', schema: { type: 'string' } },
    ];
    d.paths['/bookings']!.parameters = [{ name: 'OrganizationId', in: 'header', required: true, schema: { type: 'string' } }];
    const doc = filterDocument(d, { omitParameters: [{ in: 'header', name: 'organizationid' }] });
    expect(doc.paths['/bookings']!.post!.parameters).toEqual([{ name: 'organizationId', in: 'query', schema: { type: 'string' } }]);
    expect(doc.paths['/bookings']!.parameters).toEqual([]);
  });
  it('orders groups by groupOrder, unlisted groups after in first-seen order', () => {
    const d = full();
    d.paths['/bookings']!.get![ORBIT_EXTENSION] = { group: 'Bookings', title: 'List bookings' };
    d.paths['/bookings']!.post![ORBIT_EXTENSION] = { group: 'Payments', title: 'Create a booking' };
    d.paths['/flights'] = { get: { [ORBIT_EXTENSION]: { group: 'Flights', title: 'List flights' }, responses: { '200': { description: 'OK' } } } };
    expect(filterDocument(d).tags!.map((t) => t.name)).toEqual(['Bookings', 'Payments', 'Flights']);
    const doc = filterDocument(d, { groupOrder: ['Flights', 'Missing'] });
    expect(doc.tags!.map((t) => t.name)).toEqual(['Flights', 'Bookings', 'Payments']);
  });
  it('keeps operations marked for another API out of this one', () => {
    const d = full();
    d.paths['/bookings']!.post![ORBIT_EXTENSION] = { group: 'Bookings', title: 'Create a booking', api: 'payments' };
    d.paths['/bookings']!.get![ORBIT_EXTENSION] = { group: 'Bookings', title: 'List bookings', api: ['travel', 'payments'] };
    const travel = filterDocument(d, { api: 'travel' });
    expect(Object.keys(travel.paths['/bookings'] ?? {})).toEqual(['get']);
    const payments = filterDocument(d, { api: 'payments' });
    expect(Object.keys(payments.paths['/bookings'] ?? {}).sort()).toEqual(['get', 'post']);
    // Without an api id (or without a marker api), every marked operation is kept.
    expect(Object.keys(filterDocument(d).paths['/bookings'] ?? {}).sort()).toEqual(['get', 'post']);
  });
});

describe('buildReferenceModel', () => {
  it('groups by tag and sorts by order', () => {
    const model = buildReferenceModel(filterDocument(full()), 'travel');
    expect(model.groups.map((g) => g.name)).toEqual(['Bookings']);
    expect(model.operations.map((o) => o.slug)).toEqual(['list-bookings', 'create-a-booking']);
    const create = model.operations[1]!;
    expect(create.requestBody!.content[0]!.example).toEqual({ seat: '12A' });
    expect(create.responses.find((r) => r.status === '201')!.content[0]!.example).toEqual({
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      passenger: { name: 'string' },
    });
  });

  it('puts untagged operations first', () => {
    const d = full();
    d.paths['/ping'] = { get: { responses: { '200': {} } } };
    const model = buildReferenceModel(d, 'x');
    expect(model.groups[0]!.name).toBeUndefined();
  });
});

describe('3.1 examples', () => {
  it('reads schema.examples for parameter examples', () => {
    const d = full();
    d.paths['/bookings/{id}']!.get![ORBIT_EXTENSION] = { group: 'Bookings', title: 'Get a booking' };
    d.paths['/bookings/{id}']!.get!.parameters = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', examples: ['bk_1'] } }];
    const op = buildReferenceModel(filterDocument(d), 'x').operations.find((o) => o.slug === 'get-a-booking')!;
    expect(op.parameters[0]!.example).toBe('bk_1');
  });
});

describe('exampleFor', () => {
  it('handles cycles', () => {
    const schemas = { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } } };
    expect(exampleFor({ $ref: '#/components/schemas/Node' }, schemas)).toEqual({ next: {} });
  });
  it('skips readOnly in requests', () => {
    const s = { type: 'object', properties: { id: { type: 'string', readOnly: true }, name: { type: 'string' } } };
    expect(exampleFor(s, {}, { direction: 'request' })).toEqual({ name: 'string' });
  });
});

describe('file fields', () => {
  /** An OpenAPI 3.0 upload, as @nestjs/swagger writes it; loadDocument upgrades it to 3.1. */
  const upload = (): Document => ({
    openapi: '3.0.3',
    info: { title: 'Files', version: '1' },
    paths: {
      '/uploads': {
        post: {
          operationId: 'upload',
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    files: { type: 'array', items: { type: 'string', format: 'binary' } },
                    cover: { type: 'string', format: 'binary' },
                    tags: { type: 'array', items: { type: 'string' }, example: ['dub', 'es'] },
                    title: { type: 'string', example: 'Trailer' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
    },
  });

  it('keeps files recognisable after the 3.1 upgrade', async () => {
    const { document } = await loadDocument(upload());
    const content = buildReferenceModel(document, 'f').operations[0]!.requestBody!.content[0]!;
    expect(content.example).toEqual({ files: [BINARY_EXAMPLE], cover: BINARY_EXAMPLE, tags: ['dub', 'es'], title: 'Trailer' });
    expect(typeLabel(content.schema!.properties!.files, {})).toBe('string · binary[]');
    expect(typeLabel(content.schema!.properties!.cover, {})).toBe('string · binary');
  });

  it('builds examples for files and encoded strings', () => {
    expect(exampleFor({ type: 'string', format: 'binary' }, {})).toBe(BINARY_EXAMPLE);
    expect(exampleFor({ contentMediaType: 'image/png' }, {})).toBe(BINARY_EXAMPLE);
    expect(exampleFor({ type: 'array', items: { contentMediaType: 'application/octet-stream' } }, {})).toEqual([BINARY_EXAMPLE]);
    expect(exampleFor({ type: 'string', contentEncoding: 'base64' }, {})).toBe('U3dhZ2dlciByb2Nrcw==');
    expect(isBinarySchema({ type: 'string', contentMediaType: 'image/png', contentEncoding: 'base64' })).toBe(false);
    expect(typeLabel({ type: 'string', contentEncoding: 'base64' }, {})).toBe('string · base64');
  });

  it('turns a form example into fields: one per list item, files marked', () => {
    expect(formFields({ files: [BINARY_EXAMPLE, BINARY_EXAMPLE], tags: ['dub', 'es'], title: 'Trailer', meta: { a: 1 }, none: [], missing: undefined })).toEqual([
      { name: 'files', value: '', file: true },
      { name: 'files', value: '', file: true },
      { name: 'tags', value: 'dub', file: false },
      { name: 'tags', value: 'es', file: false },
      { name: 'title', value: 'Trailer', file: false },
      { name: 'meta', value: '{"a":1}', file: false },
      { name: 'none', value: '', file: false },
      { name: 'missing', value: '', file: false },
    ]);
    expect(formFields(undefined)).toEqual([]);
  });
});

describe('findDocumentationGaps', () => {
  it('accepts file downloads and binary upload fields', () => {
    const gaps = findDocumentationGaps({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths: {
        '/reports/{id}': {
          get: {
            description: 'Download a report.',
            parameters: [{ name: 'id', in: 'path', required: true, description: 'Report id.', example: 'r_1', schema: { type: 'string' } }],
            responses: { '200': { description: 'The PDF.', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } } },
          },
          post: {
            description: 'Upload a file.',
            requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary', description: 'The file.' } } } } } },
            responses: { '204': { description: 'Done.' } },
          },
          // An empty-bodied DELETE is fine; an untyped PUT is not.
          delete: { description: 'Delete it.', responses: { '200': { description: 'Deleted.' } } },
          put: { description: 'Rename it.', responses: { '200': { description: 'Renamed.' } } },
        },
      },
    } as never);
    expect(gaps).toEqual(['PUT /reports/{id}: 200 response has no schema']);
  });
  it('reports missing descriptions and examples', () => {
    const gaps = findDocumentationGaps(filterDocument(full()));
    expect(gaps).toContain('GET /bookings: no description');
    expect(gaps).toContain('POST /bookings: body.seat has no description');
  });
  it('writes array items as name[] in gap paths', () => {
    const gaps = findDocumentationGaps({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths: {
        '/trips': {
          post: {
            description: 'Book a trip.',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      passengers: {
                        type: 'array',
                        description: 'Who travels.',
                        items: { type: 'object', properties: { email: { type: 'string', description: 'Email.' }, tags: { type: 'array', description: 'Tags.', items: { type: 'object', properties: { label: { type: 'string' } } } } } },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'OK',
                content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } } } },
              },
            },
          },
        },
      },
    } as never);
    expect(gaps).toContain('POST /trips: body.passengers[].email has no example');
    expect(gaps).toContain('POST /trips: body.passengers[].tags[].label has no description');
    expect(gaps).toContain('POST /trips: 200[].id has no description');
    expect(gaps.join('\n')).not.toMatch(/\.\[\]|\]\w/);
  });
});

describe('loadDocument', () => {
  it('upgrades Swagger 2.0', async () => {
    const { document } = await loadDocument({
      swagger: '2.0',
      info: { title: 'Old', version: '1' },
      paths: { '/a': { get: { responses: { '200': { description: 'ok' } } } } },
    });
    expect(document.openapi.startsWith('3.1')).toBe(true);
  });
  it('parses YAML', async () => {
    const { document } = await loadDocument('openapi: 3.1.0\ninfo: {title: Y, version: "1"}\npaths: {}\n');
    expect(document.info.title).toBe('Y');
  });
});

describe('helpers', () => {
  it('slugify', () => expect(slugify('Create a Booking (async) — now')).toBe('create-a-booking-now'));
  it('stableStringify sorts paths', () => {
    const out = stableStringify({ openapi: '3.1.0', paths: { '/b': {}, '/a': {} } });
    expect(out.indexOf('/a')).toBeLessThan(out.indexOf('/b'));
  });
});

describe('pruneDocument / pruneModel', () => {
  const doc = (): Document => ({
    openapi: '3.1.0',
    info: { title: 'Pets', version: '1' },
    tags: [{ name: 'Pets' }, { name: 'Admin', description: 'Staff only.' }, { name: 'Declared' }],
    paths: {
      '/pets': {
        get: { operationId: 'listPets', tags: ['Pets'], responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } },
        delete: {
          operationId: 'deleteAll',
          tags: ['Admin'],
          parameters: [{ $ref: '#/components/parameters/Confirm' }],
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Purge' } } } },
          responses: { '204': { description: 'Gone' } },
        },
      },
      '/purge': { post: { operationId: 'purge', tags: ['Admin'], responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
    },
    components: {
      schemas: {
        Pet: { type: 'object', properties: { name: { type: 'string' } } },
        Purge: { type: 'object', properties: { reason: { $ref: '#/components/schemas/Reason' } } },
        Reason: { type: 'string' },
        Unused: { type: 'object' },
      },
      parameters: { Confirm: { name: 'confirm', in: 'query', schema: { type: 'boolean' } } },
      securitySchemes: { key: { type: 'apiKey', in: 'header', name: 'x-key' } },
    },
  });

  it('drops operations, empty paths and what only they used', () => {
    const out = pruneDocument(doc(), (method, path) => !(path === '/purge' || method === 'delete'));
    expect(Object.keys(out.paths)).toEqual(['/pets']);
    expect(Object.keys(out.paths['/pets']!)).toEqual(['get']);
    expect(Object.keys(out.components!.schemas!)).toEqual(['Pet', 'Unused']);
    expect(out.components!.parameters).toEqual({});
    expect(out.components!.securitySchemes).toBeDefined();
    expect(out.tags!.map((t) => t.name)).toEqual(['Pets', 'Declared']);
    // The input is untouched.
    expect(Object.keys(doc().paths)).toHaveLength(2);
  });

  it('returns the same document when nothing is removed', () => {
    const d = doc();
    expect(pruneDocument(d, () => true)).toBe(d);
  });

  it('prunes the reference model the same way', () => {
    const model = buildReferenceModel(doc(), 'pets');
    const out = pruneModel(model, (op) => op.slug === 'listpets');
    expect(out.operations.map((o) => o.slug)).toEqual(['listpets']);
    expect(out.groups.map((g) => g.name)).toEqual(['Pets']);
    expect(Object.keys(out.schemas).sort()).toEqual(['Pet', 'Unused']);
    // Slugs come from the full model, so they stay stable.
    expect(pruneModel(model, (op) => op.slug !== 'listpets').operations.map((o) => o.slug)).toEqual(['deleteall', 'purge']);
  });
});
