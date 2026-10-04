import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveConfig } from '@orbitdocs/core';
import { buildReferenceModel, loadDocument } from '@orbitdocs/openapi';
import { describe, expect, it } from 'vitest';

import { withHandlers } from './mock';
import { authEnvVar, generatorExamples, pythonSample, sampleAuth, sdkDir, sdkWarnings, tsSample } from './sdk';
import { exampleOptions, sdkFunctions } from './sdk-test';

const spec = {
  openapi: '3.1.0',
  info: { title: 'Shop', version: '1' },
  servers: [{ url: 'https://api.shop.test' }],
  paths: {
    '/orders/{id}': {
      get: {
        operationId: 'get-an-order',
        summary: 'Get an order',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'ord_1' },
          { name: 'expand', in: 'query', schema: { type: 'string' } },
          { name: 'X-Trace', in: 'header', required: true, schema: { type: 'string', example: 't-1' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/orders': {
      post: {
        operationId: 'create-an-order',
        summary: 'Create an order',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { sku: { type: 'string', example: 'sku_9' } } } } } },
        responses: { '201': { description: 'Created' } },
      },
    },
  },
};

async function model() {
  const { document } = await loadDocument(JSON.stringify(spec));
  return { document, model: buildReferenceModel(document, 'shop') };
}

describe('mock handlers', () => {
  it('puts configured handlers on their operations as x-handler', async () => {
    const { document } = await model();
    withHandlers(document, 'shop', { 'create-an-order': 'return { ok: true }', 'shop/get-an-order': 'return store.get("orders", req.params.id)' });
    expect((document.paths!['/orders']!.post as Record<string, unknown>)['x-handler']).toBe('return { ok: true }');
    expect((document.paths!['/orders/{id}']!.get as Record<string, unknown>)['x-handler']).toContain('store.get');
  });
});

describe('SDK samples and contract tests', () => {
  it('builds call options from the examples', async () => {
    const { model: m } = await model();
    const get = m.operations.find((o) => o.slug === 'get-an-order')!;
    expect(exampleOptions(get, m)).toEqual({ path: { id: 'ord_1' }, headers: { 'X-Trace': 't-1' } });
    const create = m.operations.find((o) => o.slug === 'create-an-order')!;
    expect(exampleOptions(create, m)).toEqual({ body: { sku: 'sku_9' } });
  });

  it('writes a TypeScript SDK sample', async () => {
    const { model: m } = await model();
    const get = m.operations.find((o) => o.slug === 'get-an-order')!;
    const code = tsSample(get, m, 'getAnOrder', '@shop/sdk', 'https://api.shop.test', { header: 'x-api-key' });
    expect(code).toContain("import { client, getAnOrder } from '@shop/sdk';");
    expect(code).toContain("headers: { 'x-api-key': process.env.API_KEY }");
    expect(code).toContain('path: { id: "ord_1" },');
    expect(code).toContain('headers: { "X-Trace": "t-1" },');
  });

  it('reads generated functions and openapi-generator examples', () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-sdk-'));
    mkdirSync(join(dir, 'ts', 'src', 'generated'), { recursive: true });
    writeFileSync(
      join(dir, 'ts', 'src', 'generated', 'sdk.gen.ts'),
      "export const getAnOrder = <T>(options: Options<T>) => (options.client ?? client).get<A, B, T>({\n  url: '/orders/{id}',\n  ...options\n});\n",
    );
    expect(sdkFunctions(join(dir, 'ts')).get('GET /orders/{id}')).toBe('getAnOrder');

    mkdirSync(join(dir, 'py', 'docs'), { recursive: true });
    writeFileSync(join(dir, 'py', 'README.md'), '*OrdersApi* | [**get_an_order**](docs/OrdersApi.md#get_an_order) | **GET** /orders/{id} | Get an order\n');
    writeFileSync(
      join(dir, 'py', 'docs', 'OrdersApi.md'),
      '# **get_an_order**\n> Order get_an_order(id)\n\n### Example\n\n```python\nimport shop\n# Defining the host is optional\nconfiguration = shop.Configuration(api_key=os.environ["KEY"])\n```\n\n### Parameters\n',
    );
    const py = generatorExamples(join(dir, 'py'), 'python').get('GET /orders/{id}')!;
    expect(py).toBe('import os\nimport shop\nconfiguration = shop.Configuration(api_key=os.environ["KEY"])');
  });

  it('names auth env vars after the scheme', () => {
    expect(authEnvVar('apiKey', 'key')).toBe('API_KEY');
    expect(authEnvVar('partner', 'key')).toBe('PARTNER_API_KEY');
    expect(authEnvVar('bearer', 'token')).toBe('BEARER_TOKEN');
    expect(authEnvVar('accessToken', 'token')).toBe('ACCESS_TOKEN');
  });

  const generatorPython = `import os
import shop
from shop.models.create_order_dto import CreateOrderDto
from shop.rest import ApiException
from pprint import pprint

configuration = shop.Configuration(
    host = "http://localhost:3010"
)

configuration.api_key['apiKey'] = os.environ["API_KEY"]

configuration = shop.Configuration(
    access_token = os.environ["BEARER_TOKEN"]
)

# Enter a context with an instance of the API client
with shop.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = shop.OrdersApi(api_client)
    create_order_dto = shop.CreateOrderDto() # CreateOrderDto | 

    try:
        api_response = api_instance.create_an_order(create_order_dto)
        pprint(api_response)
    except Exception as e:
        print("Exception: %s\\n" % e)`;

  const securedModel = async (security: unknown[]) => {
    const secured = structuredClone(spec) as Record<string, unknown> & { paths: Record<string, Record<string, Record<string, unknown>>> };
    secured.components = {
      securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' }, bearer: { type: 'http', scheme: 'bearer' } },
    };
    secured.paths['/orders']!.post!.security = security;
    secured.paths['/orders']!.post!.requestBody = {
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: { sku: { type: 'string' }, gift: { type: 'boolean' }, note: { type: 'string', nullable: true } } }, example: { sku: 'sku_9', gift: false, note: null } } },
    };
    const { document } = await loadDocument(JSON.stringify(secured));
    const m = buildReferenceModel(document, 'shop');
    return { m, op: m.operations.find((o) => o.slug === 'create-an-order')! };
  };

  it('uses the operation\'s API key scheme in Python samples, builds configuration once and fills the model', async () => {
    const { m, op } = await securedModel([{ apiKey: [] }, { bearer: [] }]);
    expect(sampleAuth(op, m)).toEqual([{ scheme: 'apiKey', header: 'x-api-key', env: 'API_KEY' }]);
    const py = pythonSample(generatorPython, op, m, 'https://api.shop.test');
    expect(py.match(/Configuration\(/g)).toHaveLength(1);
    expect(py).toContain('configuration = shop.Configuration(\n    host = "https://api.shop.test",\n)');
    expect(py).toContain('configuration.api_key["apiKey"] = os.environ["API_KEY"]');
    expect(py).not.toContain('BEARER_TOKEN');
    expect(py).toContain('create_order_dto = shop.CreateOrderDto.from_dict({\n        "sku": "sku_9",\n        "gift": False,\n        "note": None,\n    })');
    expect(py.startsWith('import os\nimport shop')).toBe(true);
    // configuration comes before the client that uses it
    expect(py.indexOf('configuration = ')).toBeLessThan(py.indexOf('with shop.ApiClient'));
  });

  it('uses a bearer token only when the operation asks for it', async () => {
    const { m, op } = await securedModel([{ bearer: [] }]);
    const py = pythonSample(generatorPython, op, m, 'https://api.shop.test');
    expect(py).toContain('    access_token = os.environ["BEARER_TOKEN"],');
    expect(py).not.toContain('api_key');
    const ts = tsSample(op, m, 'createAnOrder', '@shop/sdk', 'https://api.shop.test', sampleAuth(op, m)[0]);
    expect(ts).toContain('auth: process.env.BEARER_TOKEN');
  });

  it('drops auth and the os import for public operations', async () => {
    const { m, op } = await securedModel([]);
    const py = pythonSample(generatorPython, op, m, 'https://api.shop.test');
    expect(py).not.toMatch(/os\.environ|^import os$/m);
    expect(py).toContain('configuration = shop.Configuration(\n    host = "https://api.shop.test",\n)');
  });
});

describe('Python samples for form bodies', () => {
  it('fills flattened form fields and enums from the example', async () => {
    const { document } = await loadDocument(
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Auth', version: '1' },
        paths: {
          '/token': {
            post: {
              operationId: 'create-a-token',
              requestBody: {
                content: {
                  'application/x-www-form-urlencoded': {
                    schema: { type: 'object', properties: { grant_type: { type: 'string', enum: ['client_credentials'] }, clientId: { type: 'string', example: 'oc_1' } } },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      }),
    );
    const m = buildReferenceModel(document, 'auth');
    const op = m.operations[0]!;
    const source = `import auth
configuration = auth.Configuration(
    host = "http://localhost"
)
with auth.ApiClient(configuration) as api_client:
    api_instance = auth.AuthApi(api_client)
    grant_type = auth.GrantType() # GrantType | Always client_credentials.
    client_id = 'client_id_example' # str | Client id.`;
    const py = pythonSample(source, op, m);
    expect(py).toContain('grant_type = auth.GrantType("client_credentials") # GrantType | Always client_credentials.');
    expect(py).toContain('client_id = "oc_1" # str | Client id.');
    expect(py).not.toContain('from_dict');
  });
});

describe('SDK output folders', () => {
  const loaded = (apis: string[], sdks: Record<string, unknown>) => ({
    dir: '/app',
    file: '/app/orbitdocs.config.ts',
    config: resolveConfig({ site: { title: 'x' }, apis: apis.map((id) => ({ id, source: { file: `${id}.json` } })), sdks }),
  });

  it('defaults to sdks/<api>/<language>', () => {
    expect(sdkDir(loaded(['a', 'b'], { python: { package: 'p' } }), 'b', 'python')).toBe('/app/sdks/b/python');
  });

  it('keeps a fixed out folder for one API', () => {
    expect(sdkDir(loaded(['a'], { python: { package: 'p', out: '../py-sdk' } }), 'a', 'python')).toBe('/py-sdk');
  });

  it('gives each API its own folder when several share out', () => {
    const l = loaded(['a', 'b'], { python: { package: 'p', out: 'clients/python' } });
    expect(sdkDir(l, 'a', 'python')).toBe('/app/clients/python/a');
    expect(sdkDir(l, 'b', 'python')).toBe('/app/clients/python/b');
    expect(sdkDir(loaded(['a', 'b'], { python: { package: 'p', out: 'clients/python' }, apis: ['b'] }), 'b', 'python')).toBe('/app/clients/python');
  });

  it('fills {api} in out', () => {
    expect(sdkDir(loaded(['a', 'b'], { typescript: { package: '@x/{api}', out: 'packages/{api}-sdk' } }), 'b', 'typescript')).toBe('/app/packages/b-sdk');
  });

  it('warns when several APIs share a package name', () => {
    expect(sdkWarnings(loaded(['a', 'b'], { python: { package: 'acme' }, typescript: { package: '@acme/{api}' } }).config)).toEqual([
      expect.stringContaining('sdks.python.package "acme"'),
    ]);
    expect(sdkWarnings(loaded(['a'], { python: { package: 'acme' } }).config)).toEqual([]);
  });
});
