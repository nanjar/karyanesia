import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Inject,
  UseGuards,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from './database';
import { ApiRequest } from './types';
import { SessionGuard } from './security';
import { assertLearningAccess } from './learning-access';
@Controller('learning')
@UseGuards(SessionGuard)
export class VideoProgressController {
  constructor(@Inject(Database) private db: Database) {}
  @Get(':id/video-progress') async get(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Query('assignment_id') context?: string,
  ) {
    const id = z.uuid().parse(raw),
      a = req.actor;
    await assertLearningAccess(this.db, a, id, z.uuid().optional().parse(context));
    return (
      (
        await this.db.query(
          'SELECT seconds,revision,updated_at FROM video_progress WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3',
          [a.tenant_id, a.id, id],
        )
      ).rows[0] || { seconds: 0, revision: 0 }
    );
  }
  @Post(':id/video-progress') async save(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = z.uuid().parse(raw),
      a = req.actor,
      input = z
        .strictObject({
          seconds: z.number().int().min(0).max(300),
          revision: z.number().int().min(0),
          assignment_id: z.uuid().optional(),
        })
        .parse(body);
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        a.tenant_id,
        a.id,
      ]);
      await assertLearningAccess(db, a, id, input.assignment_id);
      const version = (
        await db.query(
          "SELECT content FROM learning_versions WHERE tenant_id=$1 AND id=$2 AND status='published'",
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!version?.content.video_url) throw new NotFoundException();
      const old = (
        await db.query(
          'SELECT revision FROM video_progress WHERE tenant_id=$1 AND membership_id=$2 AND version_id=$3',
          [a.tenant_id, a.id, id],
        )
      ).rows[0];
      if ((old?.revision || 0) !== input.revision)
        throw new ConflictException('Posisi video berubah pada perangkat lain.');
      return (
        await db.query(
          'INSERT INTO video_progress(tenant_id,membership_id,version_id,seconds,revision) VALUES($1,$2,$3,$4,1) ON CONFLICT(tenant_id,membership_id,version_id) DO UPDATE SET seconds=EXCLUDED.seconds,revision=video_progress.revision+1,updated_at=now() RETURNING revision,seconds,updated_at',
          [
            a.tenant_id,
            a.id,
            id,
            Math.min(input.seconds, version.content.video_duration_seconds || 300),
          ],
        )
      ).rows[0];
    });
  }
}
