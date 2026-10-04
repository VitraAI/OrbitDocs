import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export enum GrantType {
  ClientCredentials = 'client_credentials',
}

export enum OAuthErrorCode {
  InvalidRequest = 'invalid_request',
  InvalidClient = 'invalid_client',
  InvalidScope = 'invalid_scope',
  UnsupportedGrantType = 'unsupported_grant_type',
}

/** Form body of a token request (RFC 6749 §4.4). */
export class TokenRequestDto {
  @ApiProperty({ enum: GrantType, enumName: 'GrantType', example: GrantType.ClientCredentials, description: 'Always `client_credentials`.' })
  @IsString()
  grant_type: string;

  /**
   * Your OAuth client id. The sample server accepts `oc_test_orbit_demo`.
   * @example "oc_test_orbit_demo"
   */
  @IsString()
  client_id: string;

  @ApiProperty({ format: 'password', example: 'ocs_test_5e8d2a7c9b1f', description: 'Your OAuth client secret. The sample server accepts `ocs_test_5e8d2a7c9b1f`.' })
  @IsString()
  client_secret: string;

  /**
   * Space-separated scopes. Omit for every scope the client may use.
   * @example "bookings:read bookings:write"
   */
  @IsOptional()
  @IsString()
  scope?: string;
}

export class TokenResponseDto {
  /**
   * Send it as `Authorization: Bearer <access_token>`.
   * @example "oat_test_Q2xpZW50Q3JlZGVudGlhbHM"
   */
  access_token: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer', description: 'Token type.' })
  token_type: 'Bearer';

  /**
   * Seconds until the token expires. Request a new one before then.
   * @example 3600
   */
  expires_in: number;

  /**
   * Scopes granted, space-separated.
   * @example "bookings:read bookings:write"
   */
  scope: string;
}

/** Error body of the token endpoint (RFC 6749 §5.2). */
export class OAuthErrorDto {
  @ApiProperty({ enum: OAuthErrorCode, enumName: 'OAuthErrorCode', example: OAuthErrorCode.InvalidClient, description: 'Machine-readable error code.' })
  error: OAuthErrorCode;

  /**
   * What went wrong, for people.
   * @example "Unknown client or wrong secret."
   */
  error_description: string;
}

export const OAUTH_ERRORS = new Set<string>(Object.values(OAuthErrorCode));
