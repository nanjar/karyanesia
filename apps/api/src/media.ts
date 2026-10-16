import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Query,
  Req,
  Res,
  Inject,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createConnection } from 'node:net';
import sharp from 'sharp';
import { Database, Executor } from './database';
import { CONFIG, Config } from './config';
import { ApiRequest, admins } from './types';
import { SessionGuard } from './security';
import { inScope } from './operations';
import { assertLearningAccess } from './learning-access';
import { audit } from './audit';
export async function scanImage(bytes: Buffer, cfg: Config) {
  if (cfg.NODE_ENV === 'test') return;
  if (!cfg.CLAMAV_HOST) throw new ServiceUnavailableException('Pemindai gambar belum tersedia.');
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: cfg.CLAMAV_HOST!, port: cfg.CLAMAV_PORT || 3310 });
    let reply = '';
    const fail = () => {
      socket.destroy();
      reject(new ServiceUnavailableException('Pemindaian gambar gagal; file belum disimpan.'));
    };
    socket.setTimeout(15000, fail);
    socket.on('error', fail);
    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      for (let i = 0; i < bytes.length; i += 65536) {
        const chunk = bytes.subarray(i, i + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (data) => {
      reply += data.toString();
      if (reply.length > 4096) fail();
      if (reply.includes('\0')) {
        socket.destroy();
        if (/: OK\0/.test(reply)) resolve();
        else reject(new UnprocessableEntityException('Gambar ditolak pemindai.'));
      }
    });
    socket.on('end', () => {
      if (!reply.includes('\0')) fail();
    });
  });
}
export async function validateLearningAssets(db: Executor, tenant: string, content: any) {
  if (content.video_url && !content.video_duration_seconds)
    throw new UnprocessableEntityException(
      'Isi durasi video setelah memeriksa konten (maksimal 300 detik).',
    );
  for (const [field, table] of [
    ['target_job_ids', 'jobs'],
    ['competency_ids', 'competencies'],
  ]) {
    const ids = content[field] || [];
    if (
      new Set(ids).size !== ids.length ||
      (
        await db.query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND id=ANY($2::uuid[])`, [
          tenant,
          ids,
        ])
      ).rows.length !== ids.length
    )
      throw new UnprocessableEntityException('Target materi tidak valid.');
  }
  const refs = [
    ...(content.images || []),
    ...content.questions.flatMap((q: any) =>
      [q.prompt_image, ...(q.option_images || [])].filter(Boolean),
    ),
  ];
  for (const r of refs) {
    if (
      !(
        await db.query(
          "SELECT id FROM media_assets WHERE tenant_id=$1 AND id=$2 AND purpose='learning'",
          [tenant, r.asset_id],
        )
      ).rows.length
    )
      throw new UnprocessableEntityException('Gambar materi tidak tersedia di tenant ini.');
  }
}
@Controller('media')
@UseGuards(SessionGuard)
export class MediaController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(CONFIG) private cfg: Config,
  ) {}
  private async access(req: ApiRequest, id: string) {
    const a = req.actor,
      row = (
        await this.db.query(
          'SELECT id,tenant_id,owner_id,purpose,instance_id FROM media_assets WHERE tenant_id=$1 AND id=$2',
          [a.tenant_id, id],
        )
      ).rows[0];
    if (!row) throw new NotFoundException();
    if (admins(a) || row.owner_id === a.id) return row;
    if (row.purpose === 'evidence') {
      const task = (
        await this.db.query('SELECT * FROM sop_instances WHERE tenant_id=$1 AND id=$2', [
          a.tenant_id,
          row.instance_id,
        ])
      ).rows[0];
      if (task && inScope(a, task)) return row;
    } else {
      const modules = (
        await this.db.query(
          "SELECT id FROM learning_versions WHERE tenant_id=$1 AND status='published' AND content::text LIKE $2",
          [a.tenant_id, '%' + id + '%'],
        )
      ).rows;
      for (const m of modules) {
        try {
          await assertLearningAccess(this.db, a, m.id);
          return row;
        } catch {}
      }
    }
    throw new NotFoundException();
  }
  @Post() async upload(@Req() req: ApiRequest, @Body() body: unknown) {
    const a = req.actor,
      input = z
        .strictObject({
          purpose: z.enum(['learning', 'evidence']),
          instance_id: z.uuid().optional(),
          base64: z
            .string()
            .min(4)
            .max(6990508)
            .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        })
        .parse(body);
    if (input.purpose === 'learning' && !admins(a) && a.role !== 'HR')
      throw new ForbiddenException();
    if (input.purpose === 'evidence') {
      const task = (
        await this.db.query('SELECT * FROM sop_instances WHERE tenant_id=$1 AND id=$2', [
          a.tenant_id,
          input.instance_id || null,
        ])
      ).rows[0];
      if (!task || task.assignee_id !== a.id) throw new ForbiddenException();
    } else if (input.instance_id) throw new UnprocessableEntityException();
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 5242880 || bytes.toString('base64') !== input.base64)
      throw new UnprocessableEntityException('Ukuran atau encoding gambar tidak valid.');
    await scanImage(bytes, this.cfg);
    let normalized: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' }),
        meta = await image.metadata();
      const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[
        input.mime
      ];
      if (meta.format !== expected || (meta.pages && meta.pages > 1)) throw Error();
      normalized = await image.rotate().png().toBuffer();
      if (normalized.length > 5242880) throw Error();
    } catch {
      throw new UnprocessableEntityException(
        'Gambar tidak valid, terlalu besar, atau format tidak sesuai.',
      );
    }
    const id = randomUUID(),
      checksum = createHash('sha256').update(normalized).digest('hex');
    await this.db.transaction(async (db) => {
      await db.query(
        'INSERT INTO media_assets(id,tenant_id,owner_id,purpose,instance_id,mime,size,checksum,bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          a.tenant_id,
          a.id,
          input.purpose,
          input.instance_id || null,
          'image/png',
          normalized.length,
          checksum,
          normalized,
        ],
      );
      await audit(db, a, req.correlationId, 'media.created', id, {
        checksum,
        size: normalized.length,
        purpose: input.purpose,
      });
    });
    return { id, checksum, mime: 'image/png', size: normalized.length };
  }
  private signature(req: ApiRequest, id: string, expires: number) {
    return createHmac('sha256', this.cfg.MFA_ENCRYPTION_KEY)
      .update(['media-v1', req.actor.tenant_id, req.actor.id, id, expires].join(':'))
      .digest('hex');
  }
  @Post(':id/url') async url(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw);
    await this.access(req, id);
    const expires = Math.floor(Date.now() / 1000) + 120;
    return {
      url: `/api/v1/media/${id}/content?expires=${expires}&signature=${this.signature(req, id, expires)}`,
      expires_at: new Date(expires * 1000).toISOString(),
    };
  }
  @Get(':id/content') async content(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const id = z.uuid().parse(raw),
      input = z
        .strictObject({
          expires: z.coerce.number().int(),
          signature: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .parse(query);
    const expected = Buffer.from(this.signature(req, id, input.expires));
    if (
      input.expires < Math.floor(Date.now() / 1000) ||
      input.expires > Math.floor(Date.now() / 1000) + 120 ||
      !timingSafeEqual(expected, Buffer.from(input.signature))
    )
      throw new ForbiddenException();
    await this.access(req, id);
    const row = (
      await this.db.query('SELECT bytes,mime FROM media_assets WHERE tenant_id=$1 AND id=$2', [
        req.actor.tenant_id,
        id,
      ])
    ).rows[0];
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(row.bytes));
  }
}
