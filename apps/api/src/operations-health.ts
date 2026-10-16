import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Inject,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from './database';
import { ApiRequest, admins } from './types';
import { SessionGuard } from './security';
import { audit } from './audit';
@Controller('operations-health')
@UseGuards(SessionGuard)
export class OperationsHealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async health(@Req() req: ApiRequest) {
    if (!admins(req.actor)) throw new ForbiddenException();
    const heartbeat = (
      await this.db.query(
        "SELECT last_success_at,now()-last_success_at<interval '3 minutes' healthy FROM worker_heartbeats WHERE name='operations'",
      )
    ).rows[0];
    return {
      as_of: new Date().toISOString(),
      worker_healthy: heartbeat?.healthy || false,
      worker_last_success: heartbeat?.last_success_at || null,
      notification_stream: (
        await this.db.query(
          "SELECT attempts,failed,next_attempt_at,updated_at FROM worker_streams WHERE name='notifications'",
        )
      ).rows[0],
      jobs: (
        await this.db.query(
          'SELECT status,count(*)::int count,MIN(updated_at) oldest FROM worker_jobs WHERE tenant_id=$1 GROUP BY status',
          [req.actor.tenant_id],
        )
      ).rows,
    };
  }
  @Get('failed-jobs') async failed(@Req() req: ApiRequest) {
    if (!admins(req.actor)) throw new ForbiddenException();
    return (
      await this.db.query(
        "SELECT id,schedule_id,local_date,attempts,updated_at FROM worker_jobs WHERE tenant_id=$1 AND status='failed' ORDER BY updated_at LIMIT 100",
        [req.actor.tenant_id],
      )
    ).rows;
  }
  @Post(':id/retry') async retry(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    if (!admins(req.actor)) throw new ForbiddenException();
    const id = z.uuid().parse(raw),
      input = z.strictObject({ reason: z.string().trim().min(10).max(2000) }).parse(body);
    return this.db.transaction(async (db) => {
      const row = (
        await db.query(
          "UPDATE worker_jobs SET status='pending',attempts=0,next_attempt_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='failed' RETURNING id",
          [req.actor.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      await audit(db, req.actor, req.correlationId, 'worker.retry', id, input);
      return row;
    });
  }
}
