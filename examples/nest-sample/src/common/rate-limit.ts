import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor, RequestMethod, UseInterceptors } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/** Requests per window, per credential. */
export const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;
const windows = new Map<string, { count: number; resetAt: number }>();

/** @nestjs/swagger keeps documented responses under this metadata key. */
const API_RESPONSE = 'swagger/apiResponse';

type HeaderDoc = { description: string; schema: Record<string, unknown> };

export const RATE_LIMIT_HEADERS: Record<string, HeaderDoc> = {
  'X-RateLimit-Limit': { description: 'Requests allowed per minute for this credential.', schema: { type: 'integer', example: RATE_LIMIT } },
  'X-RateLimit-Remaining': { description: 'Requests left in the current window.', schema: { type: 'integer', example: 59 } },
  'X-RateLimit-Reset': { description: 'When the window resets, in Unix seconds.', schema: { type: 'integer', example: 1949398800 } },
};

const RETRY_AFTER: Record<string, HeaderDoc> = {
  'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer', example: 42 } },
};

/** The 429 body; `ErrorResponse` is the standard error schema OrbitDocs adds. */
const TOO_MANY_REQUESTS_BODY = {
  'application/json': {
    schema: { $ref: '#/components/schemas/ErrorResponse' },
    example: { statusCode: 429, message: `Rate limit exceeded: ${RATE_LIMIT} requests per minute. Wait Retry-After seconds.` },
  },
};

/** Counts requests per API key, token or IP in a fixed one-minute window. */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const key = req.header('x-api-key') ?? req.header('authorization') ?? req.ip ?? 'anonymous';
    const now = Date.now();
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + WINDOW_MS };
      windows.set(key, window);
    }
    window.count++;
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - window.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(window.resetAt / 1000));
    if (window.count > RATE_LIMIT) {
      res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      throw new HttpException(`Rate limit exceeded: ${RATE_LIMIT} requests per minute. Wait Retry-After seconds.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    return next.handle();
  }
}

/**
 * Adds headers to one documented response without replacing its schema
 * (`@ApiResponse` for the same status would drop the inferred type).
 */
export function addResponseHeaders(handler: object, status: number | string, headers: Record<string, HeaderDoc>, description = '', content?: object): void {
  const responses = { ...((Reflect.getMetadata(API_RESPONSE, handler) as Record<string, Record<string, unknown>>) ?? {}) };
  const existing = responses[status] ?? {};
  responses[status] = {
    ...existing,
    description: (existing.description as string) || description,
    headers: { ...headers, ...(existing.headers as object) },
    ...(content && !existing.content && !existing.type ? { content } : {}),
  };
  Reflect.defineMetadata(API_RESPONSE, responses, handler);
}

/** Documents extra headers on one route's response. */
export function ResponseHeaders(status: number, headers: Record<string, HeaderDoc>): MethodDecorator {
  return (_target, _key, descriptor) => {
    addResponseHeaders(descriptor.value as object, status, headers);
    return descriptor;
  };
}

/**
 * Rate-limits every route of a controller, and documents it: rate-limit
 * headers on each success response and a 429 with `Retry-After`.
 */
export function RateLimited(): ClassDecorator {
  return (target) => {
    UseInterceptors(RateLimitInterceptor)(target);
    const proto = target.prototype as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(proto)) {
      const handler = proto[key];
      if (key === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const status = (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined) ?? (method === RequestMethod.POST ? 201 : 200);
      addResponseHeaders(handler, status, RATE_LIMIT_HEADERS);
      addResponseHeaders(handler, 429, { ...RETRY_AFTER, ...RATE_LIMIT_HEADERS }, `Too many requests: more than ${RATE_LIMIT} a minute. Wait \`Retry-After\` seconds, then retry.`, TOO_MANY_REQUESTS_BODY);
    }
  };
}
