import { schemaRef } from './refs';
import type { Operation, Schema } from './types';

/** Name of the shared error body schema added to the document. */
export const ERROR_SCHEMA = 'ErrorResponse';

/** NestJS's default HttpException body (`{ statusCode, message, error }`). */
export const STANDARD_ERROR_SCHEMAS: Record<string, Schema> = {
  [ERROR_SCHEMA]: {
    type: 'object',
    description: 'Error body returned for every 4xx and 5xx response.',
    required: ['statusCode', 'message'],
    properties: {
      statusCode: { type: 'integer', description: 'HTTP status code, repeated in the body.', example: 404 },
      message: {
        description:
          'What went wrong, for people. Validation failures list one entry per problem. Do not branch on this text.',
        oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        example: 'Booking not found',
      },
      error: { type: 'string', description: 'Short name of the status.', example: 'Not Found' },
    },
  },
};

export const STANDARD_ERROR_TEXT: Record<string, string> = {
  '400': 'The request is invalid: a parameter or body field failed validation.',
  '401': 'Authentication is missing or invalid.',
  '403': 'Authenticated, but not allowed to do this.',
  '404': 'The resource does not exist, or you cannot see it.',
  '409': 'The resource is not in a state that allows this.',
  '413': 'The request body is too large.',
  '422': 'The request is well-formed but cannot be processed.',
  '429': 'Too many requests. Wait, then retry.',
  '500': 'Something failed on the server. Retry with backoff.',
};

/** NestJS's default body for each status, used as that response's example. */
const ERROR_EXAMPLES: Record<string, { statusCode: number; message: string | string[]; error?: string }> = {
  '400': { statusCode: 400, message: ['email must be an email'], error: 'Bad Request' },
  '401': { statusCode: 401, message: 'Unauthorized' },
  '403': { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
  '404': { statusCode: 404, message: 'Not Found' },
  '409': { statusCode: 409, message: 'Conflict', error: 'Conflict' },
  '413': { statusCode: 413, message: 'Payload Too Large' },
  '422': { statusCode: 422, message: 'Unprocessable Entity' },
  '429': { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
  '500': { statusCode: 500, message: 'Internal server error' },
};

const SUCCESS_TEXT: Record<string, string> = {
  '200': 'OK',
  '201': 'Created',
  '202': 'Accepted',
  '204': 'No content',
};

export interface StandardResponseOptions {
  /** Whether the operation requires authentication (adds 401/403). */
  secured: boolean;
  /** Override descriptions per status code. */
  descriptions?: Record<string, string>;
  /** Extra codes added to every operation (e.g. `['429']` behind a rate limiter). */
  extra?: string[];
}

/**
 * Adds the errors an operation can return by construction — 400 when it takes
 * input, 401/403 when it is secured, 404 when its path has a parameter, 500
 * always — and gives every error without a body the shared error schema.
 * Route-level descriptions win. Mutates and returns `op`.
 */
export function applyStandardResponses(
  op: Operation,
  path: string,
  options: StandardResponseOptions,
): Operation {
  const responses = (op.responses ??= {});
  const codes = new Set<string>(['500', ...(options.extra ?? [])]);
  if (op.parameters?.length || op.requestBody) codes.add('400');
  if (options.secured) {
    codes.add('401');
    codes.add('403');
  }
  if (/\{[^}]+\}/.test(path)) codes.add('404');
  for (const code of codes) responses[code] ??= {};

  const text = { ...STANDARD_ERROR_TEXT, ...options.descriptions };
  for (const [code, response] of Object.entries(responses)) {
    if (!response.description) response.description = SUCCESS_TEXT[code] ?? text[code] ?? '';
    if (/^[45]/.test(code) && !response.content) {
      const example = ERROR_EXAMPLES[code] ?? { statusCode: Number(code), message: text[code] ?? 'Error' };
      response.content = { 'application/json': { schema: schemaRef(ERROR_SCHEMA), example } };
    }
  }
  op.responses = Object.fromEntries(Object.entries(responses).sort(([a], [b]) => a.localeCompare(b)));
  return op;
}
