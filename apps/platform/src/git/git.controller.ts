import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { GitService } from './git.service';

@Controller('api/git')
export class GitController {
  constructor(private readonly git: GitService) {}

  /** GitHub and GitLab webhooks: push to the production branch, PR/MR opened, updated, merged or closed. */
  @Post(':projectId/webhook')
  @HttpCode(200)
  webhook(@Param('projectId') projectId: string, @Req() req: Request & { rawBody?: Buffer }) {
    return this.git.webhook(projectId, req.headers, req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})));
  }
}
