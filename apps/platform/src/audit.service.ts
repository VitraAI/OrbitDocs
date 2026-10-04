import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, type SQL } from 'drizzle-orm';

import { DB } from './config';
import type { Db } from './db';
import { auditLog } from './db/schema';

export interface Actor {
  id?: string;
  email: string;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(actor: Actor, action: string, opts: { projectId?: string; target?: string; data?: Record<string, unknown> } = {}) {
    await this.db.insert(auditLog).values({ actorId: actor.id, actor: actor.email, action, projectId: opts.projectId, target: opts.target, data: opts.data ?? {}, ip: actor.ip });
  }

  /** Newest first; `before` pages through older entries. */
  list(opts: { projectId?: string; before?: number; limit?: number } = {}) {
    const where: SQL[] = [];
    if (opts.projectId) where.push(eq(auditLog.projectId, opts.projectId));
    if (opts.before) where.push(lt(auditLog.id, opts.before));
    return this.db
      .select()
      .from(auditLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(Math.min(opts.limit ?? 50, 200));
  }
}
