import {
  Body,
  Controller,
  Post,
  Param,
  Req,
  Inject,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from './database';
import { ApiRequest, admins } from './types';
import { SessionGuard } from './security';
import { audit } from './audit';
import { token, digest, encryptSecret, newMfaSecret } from './crypto';
import { CONFIG, Config } from './config';
import { randomUUID } from 'node:crypto';
import { skillsFor } from './competencies';
@Controller('memberships')
@UseGuards(SessionGuard)
export class LifecycleController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(CONFIG) private cfg: Config,
  ) {}
  @Post(':id/access') async access(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor;
    if (!admins(a)) throw new ForbiddenException();
    const id = z.uuid().parse(raw),
      input = z
        .strictObject({
          role: z.enum(['ADMIN', 'HR', 'OPERATIONS', 'SUPERVISOR', 'STAFF']),
          branch_ids: z
            .array(z.uuid())
            .max(100)
            .refine((v) => new Set(v).size === v.length),
          assessor: z.boolean(),
          reason: z.string().trim().min(10).max(2000),
        })
        .parse(body);
    if (id === a.id || (input.role === 'ADMIN' && a.role !== 'OWNER'))
      throw new ForbiddenException();
    return this.db.transaction(async (db) => {
      const target = (
        await db.query(
          "SELECT * FROM memberships WHERE tenant_id=$1 AND id=$2 AND role<>'OWNER' AND active FOR UPDATE",
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!target || (target.role === 'ADMIN' && a.role !== 'OWNER')) throw new NotFoundException();
      if (input.role === 'STAFF' && (input.branch_ids.length || input.assessor))
        throw new ConflictException('Staf tidak mendapat hak penilai atau scope tim.');
      const branches = (
        await db.query('SELECT id FROM branches WHERE tenant_id=$1 AND id=ANY($2::uuid[])', [
          a.tenant_id,
          input.branch_ids,
        ])
      ).rows;
      if (branches.length !== input.branch_ids.length)
        throw new ConflictException('Scope tidak valid.');
      let mfa_enrollment_uri: string | undefined;
      if (input.role === 'ADMIN') {
        const user = (
          await db.query('SELECT mfa_secret FROM users WHERE id=$1 FOR UPDATE', [target.user_id])
        ).rows[0];
        if (!user.mfa_secret) {
          const secret = newMfaSecret();
          await db.query('UPDATE users SET mfa_secret=$1,mfa_last_step=NULL WHERE id=$2', [
            encryptSecret(secret, this.cfg.MFA_ENCRYPTION_KEY),
            target.user_id,
          ]);
          mfa_enrollment_uri = `otpauth://totp/${encodeURIComponent('Karyanesia:' + target.employee_number)}?secret=${secret}&issuer=Karyanesia&algorithm=SHA1&digits=6&period=30`;
        }
      }
      await db.query('UPDATE memberships SET role=$1,assessor=$2 WHERE tenant_id=$3 AND id=$4', [
        input.role,
        input.assessor,
        a.tenant_id,
        id,
      ]);
      await db.query('DELETE FROM branch_grants WHERE tenant_id=$1 AND membership_id=$2', [
        a.tenant_id,
        id,
      ]);
      for (const b of branches)
        await db.query(
          'INSERT INTO branch_grants(tenant_id,membership_id,branch_id) VALUES($1,$2,$3)',
          [a.tenant_id, id, b.id],
        );
      await db.query('DELETE FROM sessions WHERE tenant_id=$1 AND membership_id=$2', [
        a.tenant_id,
        id,
      ]);
      await audit(db, a, req.correlationId, 'membership.access_changed', id, input);
      return { id, session_revoked: true, ...(mfa_enrollment_uri ? { mfa_enrollment_uri } : {}) };
    });
  }
  @Post(':id/transfer-preview') async preview(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    if (!admins(req.actor)) throw new ForbiddenException();
    const id = z.uuid().parse(raw),
      input = z.strictObject({ branch_id: z.uuid(), job_id: z.uuid() }).parse(body),
      a = req.actor;
    const row = (
      await this.db.query(
        "SELECT id FROM memberships WHERE tenant_id=$1 AND id=$2 AND role='STAFF'",
        [a.tenant_id, id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException();
    const refs = (
      await this.db.query(
        'SELECT b.id,j.id job_id FROM branches b,jobs j WHERE b.tenant_id=$1 AND j.tenant_id=$1 AND b.id=$2 AND j.id=$3',
        [a.tenant_id, input.branch_id, input.job_id],
      )
    ).rows;
    if (!refs.length) throw new ConflictException('Cabang/jabatan tidak valid.');
    return {
      target: input,
      open_assignments: (
        await this.db.query(
          "SELECT id,snapshot FROM onboarding_assignments WHERE tenant_id=$1 AND membership_id=$2 AND status<>'cancelled'",
          [a.tenant_id, id],
        )
      ).rows,
      skills: await skillsFor(this.db, a.tenant_id, id),
      requirements:
        (
          await this.db.query(
            'SELECT * FROM job_requirement_versions WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision DESC LIMIT 1',
            [a.tenant_id, input.job_id],
          )
        ).rows[0] || null,
      policy:
        'Tugas lama dipertahankan; pembatalan memerlukan tindakan beralasan terpisah. Jadwal SOP berikutnya memeriksa ulang target.',
    };
  }
  @Post(':id/transfer') async transfer(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor;
    if (!admins(a)) throw new ForbiddenException();
    const id = z.uuid().parse(raw),
      input = z
        .strictObject({
          branch_id: z.uuid(),
          job_id: z.uuid(),
          reason: z.string().trim().min(10).max(2000),
          confirm_preserve_history: z.literal(true),
        })
        .parse(body);
    return this.db.transaction(async (db) => {
      const refs = (
        await db.query(
          'SELECT b.id,j.id job_id FROM branches b,jobs j WHERE b.tenant_id=$1 AND j.tenant_id=$1 AND b.id=$2 AND j.id=$3 FOR SHARE OF b,j',
          [a.tenant_id, input.branch_id, input.job_id],
        )
      ).rows;
      if (!refs.length) throw new ConflictException('Cabang/jabatan tidak valid.');
      const row = (
        await db.query(
          "UPDATE memberships SET branch_id=$1,job_id=$2,supervisor_id=NULL WHERE tenant_id=$3 AND id=$4 AND role='STAFF' RETURNING id",
          [input.branch_id, input.job_id, a.tenant_id, id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException();
      await db.query('DELETE FROM sessions WHERE tenant_id=$1 AND membership_id=$2', [
        a.tenant_id,
        id,
      ]);
      await audit(db, a, req.correlationId, 'membership.transferred', id, input);
      return { id, history_preserved: true };
    });
  }
  @Post(':id/reset') async reset(
    @Req() req: ApiRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const a = req.actor;
    if (!admins(a)) throw new ForbiddenException();
    const id = z.uuid().parse(raw),
      input = z.strictObject({ reason: z.string().trim().min(10).max(2000) }).parse(body);
    if (id === a.id) throw new ForbiddenException();
    return this.db.transaction(async (db) => {
      const target = (
        await db.query(
          "SELECT * FROM memberships WHERE tenant_id=$1 AND id=$2 AND role<>'OWNER' AND active FOR UPDATE",
          [a.tenant_id, id],
        )
      ).rows[0];
      if (!target || (target.role === 'ADMIN' && a.role !== 'OWNER')) throw new NotFoundException();
      if (
        (
          await db.query('SELECT 1 FROM memberships WHERE user_id=$1 AND tenant_id<>$2', [
            target.user_id,
            a.tenant_id,
          ])
        ).rows.length
      )
        throw new ConflictException(
          'Identitas digunakan pada beberapa perusahaan; pemulihan memerlukan operator identitas.',
        );
      const value = token();
      await db.query(
        'DELETE FROM sessions WHERE membership_id IN (SELECT id FROM memberships WHERE user_id=$1)',
        [target.user_id],
      );
      await db.query('UPDATE users SET password_hash=NULL WHERE id=$1', [target.user_id]);
      await db.query(
        'UPDATE activation_tokens SET used_at=now() WHERE tenant_id=$1 AND membership_id=$2 AND used_at IS NULL',
        [a.tenant_id, id],
      );
      await db.query(
        "INSERT INTO activation_tokens(tenant_id,membership_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')",
        [a.tenant_id, id, digest(value)],
      );
      await audit(db, a, req.correlationId, 'membership.password_reset', id, input);
      return { activation_token: value, expires_in_hours: 24 };
    });
  }
}
