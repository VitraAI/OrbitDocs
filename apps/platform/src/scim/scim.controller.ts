import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';

import { AuditService } from '../audit.service';
import { CONFIG, DB, type PlatformConfig } from '../config';
import type { Db } from '../db';
import { users } from '../db/schema';

const USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
const LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

type ScimUser = { userName?: string; name?: { givenName?: string; familyName?: string; formatted?: string }; displayName?: string; active?: boolean; externalId?: string; emails?: Array<{ value: string; primary?: boolean }> };

/**
 * SCIM 2.0 (RFC 7644) for Okta, Entra ID and other identity providers: they
 * create, update and deactivate platform users. Bearer SCIM_TOKEN.
 */
@Controller('scim/v2')
export class ScimController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: PlatformConfig,
    private readonly audit: AuditService,
  ) {}

  private check(req: Request) {
    if (!this.config.scimToken) throw new ForbiddenException('SCIM is off: set SCIM_TOKEN');
    if (String(req.headers.authorization ?? '') !== `Bearer ${this.config.scimToken}`) throw new UnauthorizedException();
    req.res!.type('application/scim+json');
  }

  private toScim(u: typeof users.$inferSelect) {
    return {
      schemas: [USER],
      id: u.id,
      externalId: u.externalId ?? undefined,
      userName: u.email,
      displayName: u.name ?? undefined,
      name: u.name ? { formatted: u.name } : undefined,
      emails: [{ value: u.email, primary: true }],
      active: u.active,
      meta: { resourceType: 'User', created: u.createdAt.toISOString(), location: `${this.config.publicUrl}/scim/v2/Users/${u.id}` },
    };
  }

  private name(body: ScimUser) {
    return body.displayName ?? body.name?.formatted ?? ([body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ') || undefined);
  }

  @Get('ServiceProviderConfig')
  serviceProviderConfig(@Req() req: Request) {
    this.check(req);
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'SCIM_TOKEN' }],
    };
  }

  @Get('Users')
  async list(@Req() req: Request, @Query('filter') filter?: string, @Query('startIndex') start = '1', @Query('count') size = '100') {
    this.check(req);
    // Identity providers look users up with `userName eq "a@b.c"`.
    const eqUser = /userName\s+eq\s+"([^"]+)"/i.exec(filter ?? '')?.[1]?.toLowerCase();
    const all = eqUser ? await this.db.select().from(users).where(eq(users.email, eqUser)) : await this.db.select().from(users);
    const from = Math.max(Number(start) - 1, 0);
    const page = all.slice(from, from + Math.min(Number(size) || 100, 200));
    return { schemas: [LIST], totalResults: all.length, startIndex: from + 1, itemsPerPage: page.length, Resources: page.map((u) => this.toScim(u)) };
  }

  @Get('Users/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    this.check(req);
    const [u] = await this.db.select().from(users).where(eq(users.id, id)).catch(() => []);
    if (!u) throw new NotFoundException();
    return this.toScim(u);
  }

  @Post('Users')
  async create(@Req() req: Request, @Body() body: ScimUser, @Res({ passthrough: true }) res: Response) {
    this.check(req);
    const email = (body.userName ?? body.emails?.find((e) => e.primary)?.value ?? body.emails?.[0]?.value ?? '').toLowerCase();
    if (!email) throw new ForbiddenException('userName is required');
    const [existing] = await this.db.select().from(users).where(eq(users.email, email));
    if (existing) {
      res.status(409);
      return { schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '409', scimType: 'uniqueness', detail: 'User already exists' };
    }
    const [u] = await this.db.insert(users).values({ email, name: this.name(body), active: body.active ?? true, externalId: body.externalId }).returning();
    await this.audit.record({ email: 'scim' }, 'user.provisioned', { target: email });
    res.status(201);
    return this.toScim(u!);
  }

  @Put('Users/:id')
  async replace(@Req() req: Request, @Param('id') id: string, @Body() body: ScimUser) {
    this.check(req);
    const [u] = await this.db
      .update(users)
      .set({ name: this.name(body), active: body.active ?? true, externalId: body.externalId, ...(body.userName ? { email: body.userName.toLowerCase() } : {}) })
      .where(eq(users.id, id))
      .returning();
    if (!u) throw new NotFoundException();
    await this.audit.record({ email: 'scim' }, u.active ? 'user.updated' : 'user.deactivated', { target: u.email });
    return this.toScim(u);
  }

  /** Okta/Entra send `{ op: "replace", value: { active: false } }` or `path: "active"`. */
  @Patch('Users/:id')
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: { schemas?: string[]; Operations?: Array<{ op: string; path?: string; value?: unknown }> }) {
    this.check(req);
    if (!body.schemas?.includes(PATCH)) throw new ForbiddenException('Expected a PatchOp');
    const set: Partial<typeof users.$inferInsert> = {};
    for (const op of body.Operations ?? []) {
      if (!/^(replace|add)$/i.test(op.op)) continue;
      const values: Record<string, unknown> = op.path ? { [op.path]: op.value } : ((op.value as Record<string, unknown>) ?? {});
      for (const [k, v] of Object.entries(values)) {
        if (k === 'active') set.active = v === true || v === 'true' || v === 'True';
        if (k === 'displayName' || k === 'name.formatted') set.name = String(v);
        if (k === 'userName') set.email = String(v).toLowerCase();
        if (k === 'externalId') set.externalId = String(v);
      }
    }
    const [u] = await this.db.update(users).set(set).where(eq(users.id, id)).returning();
    if (!u) throw new NotFoundException();
    await this.audit.record({ email: 'scim' }, set.active === false ? 'user.deactivated' : 'user.updated', { target: u.email, data: { ...set } });
    return this.toScim(u);
  }

  @Delete('Users/:id')
  @HttpCode(204)
  async remove(@Req() req: Request, @Param('id') id: string) {
    this.check(req);
    // Deprovisioned users are deactivated, not deleted, so the audit trail stays intact.
    const [u] = await this.db.update(users).set({ active: false }).where(eq(users.id, id)).returning();
    if (!u) throw new NotFoundException();
    await this.audit.record({ email: 'scim' }, 'user.deprovisioned', { target: u.email });
  }
}
