import type { IncomingMessage, ServerResponse } from 'node:http';

import { type AuthHandler, createAuth, type AuthOptions } from './handler';

type Req = IncomingMessage & { originalUrl?: string; body?: unknown };
type Next = (err?: unknown) => void;

type BodyReq = Req & { rawBody?: Buffer };

async function readBody(req: BodyReq): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  // Nest with `rawBody: true` keeps the original bytes.
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  // A body parser consumed the stream: re-encode what it parsed in the request's own format.
  if (req.body !== undefined && typeof req.body === 'object' && req.body !== null) {
    const type = String(req.headers['content-type'] ?? '');
    if (type.includes('json')) return Buffer.from(JSON.stringify(req.body));
    return Buffer.from(new URLSearchParams(req.body as Record<string, string>).toString());
  }
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Node request → Web Request (for the shared handlers). */
export async function toWebRequest(req: Req): Promise<Request> {
  const host = req.headers.host ?? 'localhost';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
  const url = `${proto}://${host}${req.originalUrl ?? req.url ?? '/'}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else if (v !== undefined) headers.set(k, v);
  }
  const body = await readBody(req);
  headers.delete('content-length');
  return new Request(url, { method: req.method, headers, body: body && body.length ? new Uint8Array(body) : undefined });
}

/** Writes a Web Response to Node, streaming the body (Ask AI answers arrive word by word). */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  if (!response.body) return void res.end();
  res.flushHeaders();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

/**
 * Express/Connect middleware around a Web handler: a Response is sent,
 * undefined passes the request on.
 */
export function webMiddleware(handle: (request: Request) => Promise<Response | undefined>) {
  return async (req: Req, res: ServerResponse, next: Next) => {
    try {
      const response = await handle(await toWebRequest(req));
      if (response) return void (await sendWebResponse(res, response));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Express/Connect middleware: serves `/_auth/*` and gates every other request
 * (put it before the static files).
 */
export function orbitAuthMiddleware(handlerOrOptions: AuthHandler | AuthOptions) {
  const auth = 'handle' in handlerOrOptions ? handlerOrOptions : createAuth(handlerOrOptions);
  return webMiddleware(async (request) => {
    const handled = await auth.handle(request);
    if (handled) return handled;
    const result = await auth.gate(request);
    return result.allowed ? undefined : result.response;
  });
}
