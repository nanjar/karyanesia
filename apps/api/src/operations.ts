import {
  Body,
  Controller,
  Get,
  Query,
  Post,
  Param,
  Req,
  Inject,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Database, Executor } from './database';
import { ApiRequest, Actor, admins } from './types';
import { SessionGuard } from './security';
import { audit } from './audit';
export const canReview = (a: Actor, branch: string) =>
  admins(a) || (['SUPERVISOR', 'OPERATIONS'].includes(a.role) && a.scopes.includes(branch));
export const inScope = (a: Actor, row: any) =>
  admins(a) ||
  row.assignee_id === a.id ||
  (['SUPERVISOR', 'OPERATIONS', 'HR'].includes(a.role) && a.scopes.includes(row.branch_id));
const reason = z.string().trim().min(10).max(2000);
const mutation = z.strictObject({
  key: z.uuid(),
  revision: z.number().int().min(0),
  action: z.enum(['draft', 'submit', 'accept', 'changes_requested', 'excused', 'cancelled']),
  answers: z
    .record(z.string(), z.union([z.boolean(), z.number().finite(), z.string().max(4000)]))
    .optional(),
  reason: reason.optional(),
});
async function latest(db: Executor, tenant: string, id: string) {
  return (
    await db.query(
      'SELECT revision,state FROM sop_events WHERE tenant_id=$1 AND instance_id=$2 ORDER BY revision DESC LIMIT 1',
      [tenant, id],
    )
  ).rows[0];
}
export async function sopState(db: Executor, tenant: string, row: any) {
  const e = await latest(db, tenant, row.id);
  return {
    ...row,
    revision: e?.revision || 0,
    state: e?.state || { status: row.status, answers: {}, first_submitted_at: null },
    overdue:
      !['accepted', 'excused', 'cancelled'].includes(e?.state?.status || row.status) &&
      Date.now() > new Date(row.due_at).getTime(),
    submitted_late: e?.state?.first_submitted_at
      ? Date.parse(e.state.first_submitted_at) > new Date(row.due_at).getTime()
      : null,
  };
}
@Controller('sop-instances')
@UseGuards(SessionGuard)
export class SopExecutionController {
  constructor(@Inject(Database) private db: Database) {}
  @Get(':id') async detail(@Req() req: ApiRequest, @Param('id') raw: string) {
    const id = z.uuid().parse(raw);
    const row = (
      await this.db.query('SELECT * FROM sop_instances WHERE tenant_id=$1 AND id=$2', [
        req.actor.tenant_id,
        id,
      ])
    ).rows[0];
    if (!row || !inScope(req.actor, row)) throw new NotFoundException();
    return {
      ...(await sopState(this.db, req.actor.tenant_id, row)),
      history: (
        await this.db.query(
          'SELECT revision,state,actor_id,created_at FROM sop_events WHERE tenant_id=$1 AND instance_id=$2 ORDER BY revision',
          [req.actor.tenant_id, id],
        )
      ).rows,
    };
  }
  @Post(':id/events') async event(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = z.uuid().parse(raw),
      input = mutation.parse(body),
      a = req.actor;
    return this.db.transaction(async (db) => {
      const row = (
        await db.query('SELECT * FROM sop_instances WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          a.tenant_id,
          id,
        ])
      ).rows[0];
      if (!row || !inScope(a, row)) throw new NotFoundException();
      const own = row.assignee_id === a.id;
      const writing = ['draft', 'submit'].includes(input.action);
      if (writing ? !own : !canReview(a, row.branch_id) || own)
        throw new ForbiddenException(
          'Tindakan memerlukan penerima atau peninjau lain yang berwenang.',
        );
      const prev = (
        await db.query(
          'SELECT request,state,revision FROM sop_events WHERE tenant_id=$1 AND instance_id=$2 AND key=$3',
          [a.tenant_id, id, input.key],
        )
      ).rows[0];
      if (prev) {
        if (!isDeepStrictEqual(prev.request, input))
          throw new ConflictException('Kunci telah digunakan.');
        return { revision: prev.revision, state: prev.state };
      }
      const current = await sopState(db, a.tenant_id, row);
      if (current.revision !== input.revision)
        throw new ConflictException('Data berubah; muat ulang.');
      let state = { ...current.state };
      if (writing) {
        if (!['open', 'in_progress', 'changes_requested'].includes(state.status))
          throw new ConflictException('Checklist tidak dapat diedit.');
        if (Date.now() < new Date(row.starts_at).getTime())
          throw new ConflictException('Shift belum dimulai.');
        const answers = input.answers ?? state.answers;
        const items = row.snapshot.template.content.items;
        for (const [key, value] of Object.entries(answers)) {
          const i = items.find((v: any) => String(v.position) === key);
          if (!i) throw new ConflictException('Item tidak dikenal.');
          if (
            (i.kind === 'boolean' && typeof value !== 'boolean') ||
            (i.kind === 'number' && (typeof value !== 'number' || Math.abs(value) > 1e9)) ||
            (i.kind === 'text' && (typeof value !== 'string' || value.length > i.max_length))
          )
            throw new ConflictException('Jenis jawaban tidak sesuai.');
        }
        for (const i of items.filter((v: any) => v.kind === 'photo')) {
          const value = answers[String(i.position)];
          if (value !== undefined) {
            if (
              !z.uuid().safeParse(value).success ||
              !(
                await db.query(
                  "SELECT id FROM media_assets WHERE tenant_id=$1 AND id=$2 AND purpose='evidence' AND instance_id=$3",
                  [a.tenant_id, value, id],
                )
              ).rows.length
            )
              throw new ConflictException('Bukti foto tidak valid untuk checklist ini.');
          }
        }
        if (input.action === 'submit')
          for (const i of items) {
            const v = answers[String(i.position)];
            if (i.required && (v === undefined || v === ''))
              throw new ConflictException('Lengkapi item wajib.');
            const failed =
              (i.kind === 'boolean' && v !== undefined && v !== i.expected) ||
              (i.kind === 'number' &&
                typeof v === 'number' &&
                ((i.min !== null && v < i.min) || (i.max !== null && v > i.max)));
            if (failed && i.issue_required) {
              const issue = (
                await db.query(
                  'SELECT id FROM issues WHERE tenant_id=$1 AND instance_id=$2 AND item_position=$3',
                  [a.tenant_id, id, i.position],
                )
              ).rows[0];
              if (!issue)
                throw new ConflictException('Laporkan kendala untuk jawaban tidak sesuai.');
            }
          }
        const now = new Date().toISOString();
        state = {
          ...state,
          answers,
          status:
            input.action === 'draft'
              ? 'in_progress'
              : row.snapshot.template.content.auto_accept && !items.some((i: any) => i.critical)
                ? 'accepted'
                : 'submitted',
          first_submitted_at:
            input.action === 'submit' ? state.first_submitted_at || now : state.first_submitted_at,
          last_submitted_at: input.action === 'submit' ? now : state.last_submitted_at,
        };
      } else {
        if (!input.reason) throw new ConflictException('Alasan wajib.');
        if (['accept', 'changes_requested'].includes(input.action) && state.status !== 'submitted')
          throw new ConflictException('Menunggu pengajuan.');
        if (
          ['excused', 'cancelled'].includes(input.action) &&
          ['accepted', 'excused', 'cancelled'].includes(state.status)
        )
          throw new ConflictException('Tugas sudah final.');
        state = {
          ...state,
          status: input.action === 'accept' ? 'accepted' : input.action,
          reason: input.reason,
          reviewed_at: new Date().toISOString(),
        };
      }
      const revision = current.revision + 1;
      await db.query(
        'INSERT INTO sop_events(id,tenant_id,instance_id,revision,key,request,state,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          a.tenant_id,
          id,
          revision,
          input.key,
          JSON.stringify(input),
          JSON.stringify(state),
          a.id,
        ],
      );
      await audit(db, a, req.correlationId, 'sop.' + input.action, id, { revision });
      return { revision, state };
    });
  }
}
const issueInput = z.strictObject({
  idempotency_key: z.uuid().optional(),
  branch_id: z.uuid(),
  category: z.string().trim().min(1).max(100),
  description: reason,
  priority: z.enum(['low', 'normal', 'high']),
  instance_id: z.uuid().optional(),
  item_position: z.number().int().min(1).max(30).optional(),
});
@Controller('issues')
@UseGuards(SessionGuard)
export class IssuesController {
  constructor(@Inject(Database) private db: Database) {}
  @Get() async list(@Req() req: ApiRequest, @Query('after') after?: string) {
    const a = req.actor;
    return (
      await this.db.query(
        `SELECT i.*,COALESCE(e.revision,0) revision,COALESCE(e.state,'{"status":"open"}'::jsonb) state FROM issues i LEFT JOIN LATERAL(SELECT revision,state FROM issue_events WHERE tenant_id=i.tenant_id AND issue_id=i.id ORDER BY revision DESC LIMIT 1)e ON true WHERE i.tenant_id=$1 AND ($2 OR i.reporter_id=$3 OR e.state->>'owner_id'=$3::text OR i.branch_id=ANY($4::uuid[])) AND ($5::uuid IS NULL OR ((i.content->>'priority'='high'),i.created_at,i.id)<(SELECT (c.content->>'priority'='high'),c.created_at,c.id FROM issues c WHERE c.tenant_id=$1 AND c.id=$5)) ORDER BY (i.content->>'priority'='high') DESC,i.created_at DESC,i.id DESC LIMIT 100`,
        [
          a.tenant_id,
          admins(a),
          a.id,
          ['SUPERVISOR', 'OPERATIONS', 'HR'].includes(a.role) ? a.scopes : [],
          z.uuid().optional().parse(after) || null,
        ],
      )
    ).rows;
  }
  @Get(':id') async detail(@Req() req: ApiRequest, @Param('id') raw: string) {
    const id = z.uuid().parse(raw),
      a = req.actor;
    const row = (
      await this.db.query('SELECT * FROM issues WHERE tenant_id=$1 AND id=$2', [a.tenant_id, id])
    ).rows[0];
    if (!row) throw new NotFoundException();
    const history = (
      await this.db.query(
        'SELECT revision,state,actor_id,created_at FROM issue_events WHERE tenant_id=$1 AND issue_id=$2 ORDER BY revision',
        [a.tenant_id, id],
      )
    ).rows;
    const state = history.at(-1)?.state || { status: 'open' };
    if (
      !admins(a) &&
      row.reporter_id !== a.id &&
      state.owner_id !== a.id &&
      !(['HR', 'OPERATIONS', 'SUPERVISOR'].includes(a.role) && a.scopes.includes(row.branch_id))
    )
      throw new NotFoundException();
    return {
      ...row,
      state,
      history,
      attachments: (
        await this.db.query(
          'SELECT asset_id,alt,created_at FROM issue_attachments WHERE tenant_id=$1 AND issue_id=$2 ORDER BY created_at',
          [a.tenant_id, id],
        )
      ).rows,
    };
  }
  @Post() async create(@Req() req: ApiRequest, @Body() body: unknown) {
    const a = req.actor,
      input = issueInput.parse(body);
    return this.db.transaction(async (db) => {
      if (
        !admins(a) &&
        !(a.role === 'STAFF' ? a.branch_id === input.branch_id : a.scopes.includes(input.branch_id))
      )
        throw new ForbiddenException();
      await db.query('SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        a.tenant_id,
        a.id,
      ]);
      if (input.idempotency_key) {
        const replay = (
          await db.query(
            'SELECT id,content FROM issues WHERE tenant_id=$1 AND reporter_id=$2 AND idempotency_key=$3',
            [a.tenant_id, a.id, input.idempotency_key],
          )
        ).rows[0];
        if (replay) {
          if (!isDeepStrictEqual(replay.content, input))
            throw new ConflictException('Kunci digunakan untuk kendala lain.');
          return { id: replay.id };
        }
      }
      if (input.instance_id) {
        const row = (
          await db.query('SELECT * FROM sop_instances WHERE tenant_id=$1 AND id=$2', [
            a.tenant_id,
            input.instance_id,
          ])
        ).rows[0];
        if (
          !row ||
          !inScope(a, row) ||
          row.branch_id !== input.branch_id ||
          !row.snapshot.template.content.items.some((i: any) => i.position === input.item_position)
        )
          throw new ConflictException('Referensi checklist tidak valid.');
      } else if (input.item_position) throw new ConflictException('Pilih checklist.');
      const id = randomUUID();
      await db.query(
        'INSERT INTO issues(id,tenant_id,branch_id,reporter_id,instance_id,item_position,content,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          a.tenant_id,
          input.branch_id,
          a.id,
          input.instance_id || null,
          input.item_position || null,
          JSON.stringify(input),
          input.idempotency_key || null,
        ],
      );
      await audit(db, a, req.correlationId, 'issue.created', id, { priority: input.priority });
      return { id };
    });
  }
  @Post(':id/attachments') async attach(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = z.uuid().parse(raw),
      a = req.actor,
      input = z
        .strictObject({ asset_id: z.uuid(), alt: z.string().trim().min(1).max(500) })
        .parse(body);
    await this.detail(req, id);
    return this.db.transaction(async (db) => {
      await db.query('SELECT id FROM issues WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
        a.tenant_id,
        id,
      ]);
      const last = (
        await db.query(
          'SELECT state FROM issue_events WHERE tenant_id=$1 AND issue_id=$2 ORDER BY revision DESC LIMIT 1',
          [a.tenant_id, id],
        )
      ).rows[0];
      const issue = (
        await db.query('SELECT reporter_id,branch_id FROM issues WHERE tenant_id=$1 AND id=$2', [
          a.tenant_id,
          id,
        ])
      ).rows[0];
      if (
        !admins(a) &&
        issue.reporter_id !== a.id &&
        last?.state.owner_id !== a.id &&
        !(['HR', 'OPERATIONS', 'SUPERVISOR'].includes(a.role) && a.scopes.includes(issue.branch_id))
      )
        throw new ForbiddenException();
      if (last?.state.status === 'closed')
        throw new ConflictException('Buka kembali kendala sebelum menambah bukti.');
      if (
        !(
          await db.query(
            "SELECT id FROM media_assets WHERE tenant_id=$1 AND id=$2 AND issue_id=$3 AND purpose='issue' AND owner_id=$4",
            [a.tenant_id, input.asset_id, id, a.id],
          )
        ).rows.length
      )
        throw new ConflictException('Bukti tidak sesuai kendala.');
      const old = (
        await db.query(
          'SELECT asset_id FROM issue_attachments WHERE tenant_id=$1 AND issue_id=$2 AND asset_id=$3',
          [a.tenant_id, id, input.asset_id],
        )
      ).rows[0];
      if (old) return old;
      if (
        Number(
          (
            await db.query(
              'SELECT count(*) n FROM issue_attachments WHERE tenant_id=$1 AND issue_id=$2',
              [a.tenant_id, id],
            )
          ).rows[0].n,
        ) >= 5
      )
        throw new ConflictException('Maksimal lima lampiran.');
      await db.query(
        'INSERT INTO issue_attachments(tenant_id,issue_id,asset_id,alt,actor_id) VALUES($1,$2,$3,$4,$5)',
        [a.tenant_id, id, input.asset_id, input.alt, a.id],
      );
      await audit(db, a, req.correlationId, 'issue.evidence_attached', id, {
        asset_id: input.asset_id,
      });
      return { asset_id: input.asset_id };
    });
  }
  @Post(':id/transitions') async transition(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = z.uuid().parse(raw),
      a = req.actor,
      input = z
        .strictObject({
          key: z.uuid(),
          revision: z.number().int().min(0),
          status: z.enum(['assigned', 'in_progress', 'resolved', 'closed', 'reopened']),
          note: reason,
          owner_id: z.uuid().optional(),
          due_at: z.iso.datetime({ offset: true }).optional(),
        })
        .parse(body);
    return this.db.transaction(async (db) => {
      const issue = (
        await db.query('SELECT * FROM issues WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          a.tenant_id,
          id,
        ])
      ).rows[0];
      if (!issue) throw new NotFoundException();
      const review = canReview(a, issue.branch_id);
      const old = (
        await db.query(
          'SELECT * FROM issue_events WHERE tenant_id=$1 AND issue_id=$2 ORDER BY revision DESC LIMIT 1',
          [a.tenant_id, id],
        )
      ).rows[0];
      const state = old?.state || { status: 'open', owner_id: null };
      if (
        !review &&
        state.owner_id !== a.id &&
        !(issue.reporter_id === a.id && input.status === 'reopened')
      )
        throw new ForbiddenException();
      const replay = (
        await db.query('SELECT * FROM issue_events WHERE tenant_id=$1 AND issue_id=$2 AND key=$3', [
          a.tenant_id,
          id,
          input.key,
        ])
      ).rows[0];
      if (replay) {
        if (!isDeepStrictEqual(replay.request, input))
          throw new ConflictException('Kunci telah digunakan.');
        return replay.state;
      }
      if ((old?.revision || 0) !== input.revision) throw new ConflictException('Data berubah.');
      const allowed: Record<string, string[]> = {
        open: ['assigned'],
        assigned: ['in_progress'],
        in_progress: ['resolved'],
        resolved: ['closed', 'reopened'],
        closed: ['reopened'],
        reopened: ['assigned', 'in_progress'],
      };
      if (!allowed[state.status]?.includes(input.status))
        throw new ConflictException('Transisi tidak valid.');
      if (['assigned', 'closed'].includes(input.status) && !review) throw new ForbiddenException();
      if (input.status !== 'assigned' && (input.owner_id || input.due_at))
        throw new ConflictException('Penanggung jawab/tenggat hanya diubah melalui penugasan.');
      if (input.status === 'assigned') {
        if (!input.owner_id || !input.due_at)
          throw new ConflictException('Pilih penanggung jawab dan tenggat.');
        const member = (
          await db.query(
            'SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 AND active AND (branch_id=$3 OR EXISTS(SELECT 1 FROM branch_grants g WHERE g.tenant_id=$1 AND g.membership_id=memberships.id AND g.branch_id=$3))',
            [a.tenant_id, input.owner_id, issue.branch_id],
          )
        ).rows[0];
        if (!member) throw new ConflictException('Penanggung jawab di luar cabang.');
      }
      const next = { ...state, ...input, owner_id: input.owner_id || state.owner_id };
      await db.query(
        'INSERT INTO issue_events(id,tenant_id,issue_id,revision,key,request,state,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          a.tenant_id,
          id,
          input.revision + 1,
          input.key,
          JSON.stringify(input),
          JSON.stringify(next),
          a.id,
        ],
      );
      await audit(db, a, req.correlationId, 'issue.' + input.status, id);
      return next;
    });
  }
}
