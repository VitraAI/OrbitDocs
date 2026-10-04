import { createHmac, timingSafeEqual } from 'node:crypto';

import { Controller, Headers, HttpCode, Post, type RawBodyRequest, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Personalization hook for the docs (not part of the public API): after a
 * reader signs in, OrbitDocs asks which API key to pre-fill for them.
 */
@Controller('internal/docs-user')
export class DocsHookController {
  @Post()
  @HttpCode(200)
  identify(@Req() req: RawBodyRequest<Request>, @Headers('x-orbitdocs-signature') signature?: string) {
    const secret = process.env.DOCS_HOOK_SECRET ?? '';
    const expected = `sha256=${createHmac('sha256', secret).update(req.rawBody ?? '').digest('hex')}`;
    if (!secret || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Bad signature');
    }
    const { email } = JSON.parse(String(req.rawBody)) as { email: string };
    // A real app would look up the reader's own test key.
    return email.endsWith('@orbit-travel.example') ? { credentials: { apiKey: 'otk_test_4f9a2c1b8e7d6a5f' } } : {};
  }
}
