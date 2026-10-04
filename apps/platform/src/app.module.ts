import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics/analytics.controller';
import { AuditService } from './audit.service';
import { AuthService } from './auth/auth.service';
import { CONFIG, DB, loadConfig, type PlatformConfig } from './config';
import { createDb } from './db';
import { GitController } from './git/git.controller';
import { GitService } from './git/git.service';
import { HostingService } from './hosting/hosting.service';
import { AdminController, AuthController, InvitationsController, ProjectsController, PublishController } from './projects/controllers';
import { ProjectsService } from './projects/projects.service';
import { PublishService } from './projects/publish.service';
import { ScimController } from './scim/scim.controller';

@Module({
  controllers: [AuthController, InvitationsController, ProjectsController, AdminController, PublishController, AnalyticsController, ScimController, GitController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: DB, useFactory: (config: PlatformConfig) => createDb(config.databaseUrl), inject: [CONFIG] },
    AuditService,
    AuthService,
    PublishService,
    ProjectsService,
    HostingService,
    GitService,
  ],
})
export class AppModule {}
