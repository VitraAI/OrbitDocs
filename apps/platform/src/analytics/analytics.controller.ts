import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { and, count, countDistinct, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import type { Request } from 'express';

import { Inject } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { DB } from '../config';
import type { Db } from '../db';
import { analyticsEvents } from '../db/schema';
import { HostingService } from '../hosting/hosting.service';
import { ProjectsService } from '../projects/projects.service';

@Controller('api')
export class AnalyticsController {
  constructor(
    private readonly auth: AuthService,
    private readonly projects: ProjectsService,
    private readonly hosting: HostingService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Caddy's on-demand TLS check: 200 when the platform serves this host. */
  @Get('domains/allowed')
  async allowed(@Query('domain') domain: string, @Req() req: Request) {
    const ok = await this.hosting.allowed(String(domain ?? '').toLowerCase());
    req.res!.status(ok ? 200 : 404);
    return { ok };
  }

  /** Views, visitors, top pages, referrers, and what readers asked Ask AI. */
  @Get('projects/:slug/analytics')
  async analytics(@Req() req: Request, @Param('slug') slug: string, @Query('days') daysParam?: string) {
    const user = await this.auth.requireUser(req);
    const project = await this.projects.bySlug(slug);
    await this.auth.requireRole(user, project.id, 'viewer');
    const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400_000);
    const scope = and(eq(analyticsEvents.projectId, project.id), gte(analyticsEvents.at, since));
    const views = and(scope, eq(analyticsEvents.type, 'pageview'));
    const asks = and(scope, eq(analyticsEvents.type, 'ask'));
    const day = sql<string>`to_char(date_trunc('day', ${analyticsEvents.at}), 'YYYY-MM-DD')`;

    const [totals] = await this.db.select({ views: count(), visitors: countDistinct(analyticsEvents.visitor) }).from(analyticsEvents).where(views);
    const daily = await this.db.select({ day, views: count(), visitors: countDistinct(analyticsEvents.visitor) }).from(analyticsEvents).where(views).groupBy(day).orderBy(day);
    const pages = await this.db.select({ path: analyticsEvents.path, views: count() }).from(analyticsEvents).where(views).groupBy(analyticsEvents.path).orderBy(desc(count())).limit(10);
    const referrers = await this.db
      .select({ referrer: analyticsEvents.referrer, views: count() })
      .from(analyticsEvents)
      .where(and(views, isNotNull(analyticsEvents.referrer)))
      .groupBy(analyticsEvents.referrer)
      .orderBy(desc(count()))
      .limit(10);
    const [askTotals] = await this.db.select({ questions: count(), unanswered: sql<number>`count(*) filter (where ${analyticsEvents.results} = 0)`.mapWith(Number) }).from(analyticsEvents).where(asks);
    const questions = await this.db
      .select({ query: analyticsEvents.query, results: analyticsEvents.results, at: analyticsEvents.at })
      .from(analyticsEvents)
      .where(asks)
      .orderBy(desc(analyticsEvents.at))
      .limit(20);
    // Fill missing days with zero so the chart has no gaps.
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10);
      return { day: d, views: byDay.get(d)?.views ?? 0, visitors: byDay.get(d)?.visitors ?? 0 };
    });
    return { provider: project.analytics.provider, days, totals: { ...totals, ...askTotals }, series, pages, referrers, questions };
  }
}
