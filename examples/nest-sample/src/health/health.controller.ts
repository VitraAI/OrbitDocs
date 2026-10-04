import { Controller, Get } from '@nestjs/common';

/** Internal: load-balancer health check. Not marked, so it never appears in the docs. */
@Controller('internal/health')
export class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}
