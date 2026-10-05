import { randomBytes } from 'node:crypto';

import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  HttpCode,
  HttpException,
  Post,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiResponse } from '@nestjs/swagger';
import { DocsOperation } from '@vitra-ai/orbitdocs-nestjs';
import type { Response } from 'express';

import { ACCESS_TOKENS, OAUTH_CLIENTS, OAUTH_SCOPES } from '../common/auth';
import { RateLimited } from '../common/rate-limit';
import { GrantType, OAUTH_ERRORS, OAuthErrorCode, OAuthErrorDto, TokenRequestDto, TokenResponseDto } from './oauth.dto';

const TOKEN_TTL_SECONDS = 3600;

/** Token-endpoint errors use the OAuth shape (`error`, `error_description`), including validation failures. */
@Catch(BadRequestException, UnauthorizedException)
class OAuthExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as string | { error?: string; error_description?: string; message?: string | string[] };
    if (typeof body === 'object' && body.error && OAUTH_ERRORS.has(body.error)) return res.status(status).json(body);
    const message = typeof body === 'string' ? body : body.message;
    res.status(status).json({
      error: status === 401 ? OAuthErrorCode.InvalidClient : OAuthErrorCode.InvalidRequest,
      error_description: Array.isArray(message) ? message.join('; ') : (message ?? exception.message),
    });
  }
}

@Controller({ path: 'oauth', version: '1' })
@RateLimited()
@UseFilters(OAuthExceptionFilter)
export class OAuthController {
  /**
   * Exchanges your client id and secret for an access token (OAuth 2.0
   * client credentials grant). Send the token as `Authorization: Bearer …`
   * instead of an API key; it expires after an hour.
   *
   * This endpoint takes no API key or token itself.
   */
  @Post('token')
  @HttpCode(200)
  @DocsOperation({ group: 'Authentication', title: 'Create an access token', order: 1 })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({ type: TokenRequestDto })
  @ApiResponse({ status: 400, type: OAuthErrorDto, description: 'Malformed request, unsupported `grant_type` or unknown scope.' })
  @ApiResponse({ status: 401, type: OAuthErrorDto, description: 'Unknown client or wrong secret.' })
  token(@Body() dto: TokenRequestDto): TokenResponseDto {
    if (dto.grant_type !== GrantType.ClientCredentials) {
      throw new BadRequestException({ error: OAuthErrorCode.UnsupportedGrantType, error_description: 'Only client_credentials is supported.' });
    }
    const client = OAUTH_CLIENTS.get(dto.client_id);
    if (!client || client.secret !== dto.client_secret) {
      throw new UnauthorizedException({ error: OAuthErrorCode.InvalidClient, error_description: 'Unknown client or wrong secret.' });
    }
    const scopes = dto.scope?.split(/\s+/).filter(Boolean) ?? OAUTH_SCOPES;
    const unknown = scopes.filter((s) => !OAUTH_SCOPES.includes(s));
    if (unknown.length) {
      throw new BadRequestException({ error: OAuthErrorCode.InvalidScope, error_description: `Unknown scope: ${unknown.join(', ')}` });
    }
    const accessToken = `oat_test_${randomBytes(18).toString('base64url')}`;
    const scope = scopes.join(' ');
    ACCESS_TOKENS.set(accessToken, { clientId: dto.client_id, scope, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS, scope };
  }
}
