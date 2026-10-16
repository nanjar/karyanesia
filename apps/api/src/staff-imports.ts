import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Response } from 'express';
import { Database, Executor } from './database';
import { SessionGuard } from './security';
import { admins, ApiRequest } from './types';
import { audit } from './audit';
import { digest } from './crypto';
const REQUIRED = ['employee_number', 'full_name', 'branch_code', 'job_code'];
const OPTIONAL = ['supervisor_employee_number', 'email', 'start_date'];
const code = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
const dataSchema = z.object({
  employee_number: code,
  full_name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\x00-\x1f\x7f]+$/),
  branch_code: code,
  job_code: code,
  supervisor_employee_number: code.optional(),
  email: z.email().max(254).optional(),
  start_date: z.iso.date().optional(),
});
type StaffData = Record<string, string>;
type ImportRow = {
  row_number: number;
  data: StaffData;
  errors: string[];
  branch_id?: string;
  job_id?: string;
  supervisor_id?: string | null;
  membership_id?: string;
  outcome?: 'created' | 'failed';
};
const previewSchema = z.strictObject({
  csv: z
    .string()
    .min(1)
    .max(1024 * 1024)
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 1024 * 1024, 'CSV maksimal 1 MiB.'),
});
function requireAdmin(req: ApiRequest) {
  if (!admins(req.actor))
    throw new ForbiddenException('Impor staf hanya tersedia untuk admin perusahaan.');
}
export function parseStaffCsv(csv: string): ImportRow[] {
  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = z
      .array(
        z.object({
          record: z.array(z.string()),
          info: z.object({ lines: z.number().int().positive() }),
        }),
      )
      .parse(
        parse(csv, {
          bom: true,
          trim: true,
          skip_empty_lines: true,
          relax_column_count: true,
          max_record_size: 16384,
          to: 5002,
          info: true,
        }),
      );
  } catch {
    throw new HttpException(
      'Format CSV tidak valid. Periksa tanda kutip dan batas 16 KiB per record.',
      422,
    );
  }
  if (records.length < 2)
    throw new HttpException('CSV harus berisi header dan setidaknya satu staf.', 422);
  if (records.length > 5001) throw new HttpException('Maksimal 5.000 staf per batch.', 422);
  const headers = records[0].record.map((v) => v.trim());
  if (
    new Set(headers).size !== headers.length ||
    REQUIRED.some((v) => !headers.includes(v)) ||
    headers.some((v) => ![...REQUIRED, ...OPTIONAL].includes(v))
  ) {
    throw new HttpException(
      'Header harus unik dan memuat employee_number, full_name, branch_code, job_code. Kolom opsional: supervisor_employee_number, email, start_date.',
      422,
    );
  }
  return records.slice(1).map(({ record, info }) => {
    const data: StaffData = {};
    headers.forEach((h, i) => {
      const v = (record[i] ?? '').trim();
      if (v || REQUIRED.includes(h)) data[h] = v;
    });
    const errors: string[] = [];
    if (record.length !== headers.length) errors.push('Jumlah kolom tidak sama dengan header.');
    const result = dataSchema.safeParse(data);
    if (!result.success)
      for (const issue of result.error.issues)
        errors.push(`${issue.path.join('.')}: nilai tidak valid.`);
    return { row_number: info.lines, data, errors };
  });
}
async function validateReferences(
  db: Executor,
  tenant: string,
  rows: ImportRow[],
): Promise<ImportRow[]> {
  const ids = [
    ...new Set(
      rows
        .flatMap((r) => [r.data.employee_number, r.data.supervisor_employee_number])
        .filter(Boolean),
    ),
  ];
  // Every reference lookup is tenant-scoped. Unknown codes never resolve across tenants.
  const branches = (await db.query('SELECT id,code FROM branches WHERE tenant_id=$1', [tenant]))
    .rows;
  const jobs = (await db.query('SELECT id,code FROM jobs WHERE tenant_id=$1', [tenant])).rows;
  const members = (
    await db.query(
      `SELECT m.id,m.employee_number,m.role,(m.active AND u.active) active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.employee_number=ANY($2::text[])`,
      [tenant, ids],
    )
  ).rows;
  const branchMap = new Map(branches.map((v) => [v.code, v.id])),
    jobMap = new Map(jobs.map((v) => [v.code, v.id])),
    memberMap = new Map(members.map((v) => [v.employee_number, v]));
  const counts = new Map<string, number>();
  for (const r of rows)
    counts.set(r.data.employee_number, (counts.get(r.data.employee_number) ?? 0) + 1);
  return rows.map((row) => {
    const r: ImportRow = { ...row, errors: [...row.errors] };
    if (!branchMap.has(r.data.branch_code))
      r.errors.push('Kode cabang tidak ditemukan dalam perusahaan Anda.');
    if (!jobMap.has(r.data.job_code))
      r.errors.push('Kode jabatan tidak ditemukan dalam perusahaan Anda.');
    if ((counts.get(r.data.employee_number) ?? 0) > 1)
      r.errors.push('ID karyawan muncul lebih dari sekali dalam CSV.');
    if (memberMap.has(r.data.employee_number))
      r.errors.push('ID karyawan sudah terdaftar dan tidak diubah.');
    const supervisor = r.data.supervisor_employee_number
      ? memberMap.get(r.data.supervisor_employee_number)
      : null;
    if (
      r.data.supervisor_employee_number &&
      (!supervisor?.active || !['OWNER', 'ADMIN', 'SUPERVISOR'].includes(supervisor.role))
    )
      r.errors.push('Supervisor aktif tidak ditemukan dalam perusahaan Anda.');
    if (r.data.employee_number === r.data.supervisor_employee_number)
      r.errors.push('Staf tidak dapat menjadi supervisor dirinya sendiri.');
    r.branch_id = branchMap.get(r.data.branch_code);
    r.job_id = jobMap.get(r.data.job_code);
    r.supervisor_id = supervisor?.id ?? null;
    return r;
  });
}
function summary(rows: ImportRow[]) {
  return {
    total: rows.length,
    valid: rows.filter((r) => !r.errors.length).length,
    invalid: rows.filter((r) => r.errors.length).length,
  };
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
@ApiTags('Staff imports')
@Controller('staff-imports')
@UseGuards(SessionGuard)
export class StaffImportsController {
  constructor(@Inject(Database) private db: Database) {}
  private async batch(db: Executor, id: string, tenant: string, lock = false) {
    const { rows } = await db.query(
      `SELECT * FROM staff_imports WHERE id=$1 AND tenant_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [id, tenant],
    );
    if (!rows[0]) throw new NotFoundException('Batch impor tidak ditemukan.');
    return rows[0];
  }
  @Post('preview')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['csv'],
      properties: {
        csv: { type: 'string', description: 'CSV UTF-8, maksimal 1 MiB dan 5.000 record.' },
      },
    },
  })
  async preview(@Body() body: unknown, @Req() req: ApiRequest) {
    requireAdmin(req);
    const { csv } = previewSchema.parse(body),
      parsed = parseStaffCsv(csv),
      id = randomUUID();
    return this.db.transaction(async (db) => {
      const rows = await validateReferences(db, req.actor.tenant_id, parsed);
      const saved = await db.query(
        'INSERT INTO staff_imports(id,tenant_id,created_by,source_hash,rows) VALUES($1,$2,$3,$4,$5) RETURNING expires_at',
        [id, req.actor.tenant_id, req.actor.id, digest(csv), JSON.stringify(rows)],
      );
      await audit(db, req.actor, req.correlationId, 'staff_import.preview', id, summary(rows));
      return {
        id,
        status: 'previewed',
        expires_at: saved.rows[0].expires_at,
        ...summary(rows),
        rows,
      };
    });
  }
  @Get()
  async recent(@Req() req: ApiRequest) {
    requireAdmin(req);
    return (
      await this.db.query(
        'SELECT id,status,created_at,expires_at,result,jsonb_array_length(rows) total FROM staff_imports WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 10',
        [req.actor.tenant_id],
      )
    ).rows;
  }
  @Get(':id')
  async get(@Param('id') raw: string, @Req() req: ApiRequest) {
    requireAdmin(req);
    const b = await this.batch(this.db, z.uuid().parse(raw), req.actor.tenant_id);
    return {
      id: b.id,
      status: b.status,
      expires_at: b.expires_at,
      ...summary(b.rows),
      rows: b.rows,
      result: b.result,
    };
  }
  @Post(':id/commit')
  @HttpCode(200)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['confirm'],
      properties: { confirm: { type: 'boolean', enum: [true] } },
    },
  })
  async commit(@Param('id') raw: string, @Body() body: unknown, @Req() req: ApiRequest) {
    requireAdmin(req);
    z.strictObject({ confirm: z.literal(true) }).parse(body);
    const id = z.uuid().parse(raw);
    return this.db.transaction(async (db) => {
      const b = await this.batch(db, id, req.actor.tenant_id, true);
      if (b.status === 'committed') return b.result;
      if (new Date(b.expires_at).getTime() <= Date.now())
        throw new HttpException(
          'Pratinjau kedaluwarsa. Unggah ulang CSV untuk validasi terbaru.',
          410,
        );
      const original: ImportRow[] = b.rows;
      if (!original.some((r) => !r.errors.length))
        throw new HttpException('Tidak ada baris valid untuk diimpor.', 422);
      const checked = await validateReferences(
        db,
        req.actor.tenant_id,
        original.filter((r) => !r.errors.length),
      );
      const latest = new Map(checked.map((r) => [r.row_number, r]));
      const output: ImportRow[] = [];
      for (const row of original) {
        if (row.errors.length) {
          output.push({ ...row, outcome: 'failed' });
          continue;
        }
        const fresh = latest.get(row.row_number)!;
        if (
          fresh.branch_id !== row.branch_id ||
          fresh.job_id !== row.job_id ||
          fresh.supervisor_id !== row.supervisor_id
        )
          fresh.errors.push(
            'Referensi organisasi berubah sejak pratinjau. Unggah ulang baris ini.',
          );
        if (fresh.errors.length) {
          output.push({ ...fresh, outcome: 'failed' });
          continue;
        }
        const uid = randomUUID(),
          mid = randomUUID();
        await db.query('SAVEPOINT import_row');
        try {
          await db.query('INSERT INTO users(id,full_name,email) VALUES($1,$2,$3)', [
            uid,
            fresh.data.full_name,
            fresh.data.email ?? null,
          ]);
          await db.query(
            `INSERT INTO memberships(id,tenant_id,user_id,employee_number,branch_id,job_id,supervisor_id,role,start_date) VALUES($1,$2,$3,$4,$5,$6,$7,'STAFF',$8)`,
            [
              mid,
              req.actor.tenant_id,
              uid,
              fresh.data.employee_number,
              fresh.branch_id,
              fresh.job_id,
              fresh.supervisor_id,
              fresh.data.start_date ?? null,
            ],
          );
          await audit(db, req.actor, req.correlationId, 'membership.import_create', mid, {
            import_id: id,
            row_number: fresh.row_number,
          });
          await db.query('RELEASE SAVEPOINT import_row');
          output.push({ ...fresh, membership_id: mid, outcome: 'created' });
        } catch (e: any) {
          await db.query('ROLLBACK TO SAVEPOINT import_row');
          await db.query('RELEASE SAVEPOINT import_row');
          if (!['23505', '23503', '23514', '22007', '22008'].includes(e.code)) throw e;
          output.push({
            ...fresh,
            outcome: 'failed',
            errors: [
              'Data sudah terdaftar atau referensi berubah saat impor. Baris ini tidak diterapkan.',
            ],
          });
        }
      }
      const created = output.filter((r) => r.outcome === 'created').length,
        result = {
          id,
          status: 'committed',
          total: output.length,
          created,
          failed: output.length - created,
        };
      await db.query(
        "UPDATE staff_imports SET rows=$1,result=$2,status='committed',committed_at=now() WHERE id=$3 AND tenant_id=$4",
        [JSON.stringify(output), JSON.stringify(result), id, req.actor.tenant_id],
      );
      await audit(db, req.actor, req.correlationId, 'staff_import.commit', id, {
        created,
        failed: result.failed,
      });
      return result;
    });
  }
  @Get(':id/errors.csv')
  async errors(@Param('id') raw: string, @Req() req: ApiRequest, @Res() res: Response) {
    requireAdmin(req);
    const id = z.uuid().parse(raw),
      b = await this.batch(this.db, id, req.actor.tenant_id);
    const fields = ['row_number', ...REQUIRED, ...OPTIONAL, 'errors'];
    const records = [
      fields,
      ...(b.rows as ImportRow[])
        .filter((r) => r.errors.length)
        .map((r) => [
          r.row_number,
          ...REQUIRED.map((k) => r.data[k]),
          ...OPTIONAL.map((k) => r.data[k]),
          r.errors.join(' | '),
        ]),
    ];
    await audit(this.db, req.actor, req.correlationId, 'staff_import.error_export', id);
    res
      .type('text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="staff-import-${id}-errors.csv"`);
    res.send('\uFEFF' + records.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n');
  }
}
