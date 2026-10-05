import { buildReferenceModel, loadDocument } from '@vitra-ai/orbitdocs-openapi';
import { describe, expect, it } from 'vitest';

import { exampleRequest } from './snippets';

describe('exampleRequest', () => {
  it('attaches files in multipart samples, one part per file of a list', async () => {
    const { document } = await loadDocument({
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/uploads': {
          post: {
            operationId: 'upload',
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } }, note: { type: 'string', example: 'hi' } },
                  },
                },
              },
            },
            responses: { '201': { description: 'Created' } },
          },
        },
      },
    });
    const model = buildReferenceModel(document, 't');
    const har = exampleRequest(model.operations[0]!, model, 'https://api.example.com');
    expect(har.postData).toEqual({
      mimeType: 'multipart/form-data',
      params: [
        { name: 'files', fileName: 'files.pdf' },
        { name: 'note', value: 'hi' },
      ],
    });
  });
});
