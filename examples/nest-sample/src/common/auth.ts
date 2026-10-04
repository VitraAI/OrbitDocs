import { applyDecorators, CanActivate, ExecutionContext, Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import type { Request } from 'express';

/** Demo keys. A real app would look keys up in a database. */
export const API_KEYS = new Set(['otk_test_4f9a2c1b8e7d6a5f']);

/** Demo OAuth client (client credentials grant); override with ORBIT_OAUTH_CLIENT_ID / ORBIT_OAUTH_CLIENT_SECRET. */
export const OAUTH_CLIENTS = new Map([
  [process.env.ORBIT_OAUTH_CLIENT_ID || 'oc_test_orbit_demo', { secret: process.env.ORBIT_OAUTH_CLIENT_SECRET || 'ocs_test_5e8d2a7c9b1f', name: 'Orbit demo app' }],
]);

/** Scopes a client can ask for. Tokens without a scope get all of them. */
export const OAUTH_SCOPES = ['bookings:read', 'bookings:write', 'payments:write', 'loyalty:read', 'loyalty:write', 'webhooks:write'];

/** Access tokens issued by `POST /v1/oauth/token`, by token. */
export const ACCESS_TOKENS = new Map<string, { clientId: string; scope: string; expiresAt: number }>();

/**
 * Accepts either an API key (`x-api-key`) or an OAuth access token
 * (`Authorization: Bearer …`).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.header('x-api-key');
    if (key && API_KEYS.has(key)) return true;
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.header('authorization') ?? '')?.[1];
    const token = bearer ? ACCESS_TOKENS.get(bearer) : undefined;
    if (token && token.expiresAt > Date.now()) return true;
    if (bearer) throw new UnauthorizedException('Access token is invalid or expired.');
    throw new UnauthorizedException('Missing or invalid API key.');
  }
}

/** Guards every route of a controller and documents both schemes (API key OR bearer token). */
export function Authenticated() {
  return applyDecorators(UseGuards(AuthGuard), ApiSecurity('apiKey'), ApiBearerAuth('bearer'));
}
