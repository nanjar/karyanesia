import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
import { CONFIG, Config } from './config';
import { decryptSecret, digest, hashPassword, token, verifyOtp, verifyPassword } from './crypto';
import { COOKIE, SessionGuard } from './security';
import type { ApiRequest } from './types';
import { audit } from './audit';
const loginSchema = z.strictObject({
  company_code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((v) => v.toLowerCase()),
  employee_number: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
const activateSchema = z.strictObject({
  token: z.string().regex(/^[\w-]{43}$/),
  password: z.string().min(12).max(128),
});
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(CONFIG) private cfg: Config,
  ) {}
  private async limit(key: string, max: number) {
    const { rows } = await this.db.query(
      `INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+interval '15 minutes')
      ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<=now() THEN 1 ELSE rate_limits.hits+1 END,
      reset_at=CASE WHEN rate_limits.reset_at<=now() THEN now()+interval '15 minutes' ELSE rate_limits.reset_at END RETURNING hits`,
      [digest(key)],
    );
    if (rows[0].hits > max)
      throw new HttpException('Terlalu banyak percobaan. Coba lagi setelah 15 menit.', 429);
  }
  @Post('login')
  @HttpCode(200)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['company_code', 'employee_number', 'password'],
      properties: {
        company_code: { type: 'string' },
        employee_number: { type: 'string' },
        password: { type: 'string', format: 'password' },
        otp: { type: 'string' },
      },
    },
  })
  async login(
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limit(`login-ip:${req.ip}`, 100);
    const input = loginSchema.parse(body);
    await this.limit(`login-account:${input.company_code}:${input.employee_number}`, 10);
    const raw = token();
    const result = await this.db.transaction(async (db) => {
      const { rows } = await db.query(
        `SELECT m.*,u.password_hash,u.mfa_secret,u.mfa_last_step,u.full_name,t.name tenant_name
        FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id
        WHERE t.code=$1 AND m.employee_number=$2 AND t.active AND m.active AND u.active FOR UPDATE OF u`,
        [input.company_code, input.employee_number],
      );
      const user = rows[0];
      const ok = await verifyPassword(input.password, user?.password_hash ?? null);
      if (!user || !ok)
        throw new UnauthorizedException('Kredensial atau kode autentikator tidak valid.');
      if (user.role === 'OWNER' || user.role === 'ADMIN') {
        const step = user.mfa_secret
          ? verifyOtp(
              decryptSecret(user.mfa_secret, this.cfg.MFA_ENCRYPTION_KEY),
              input.otp ?? '',
              user.mfa_last_step === null ? null : Number(user.mfa_last_step),
            )
          : null;
        if (step === null)
          throw new UnauthorizedException('Kredensial atau kode autentikator tidak valid.');
        await db.query('UPDATE users SET mfa_last_step=$1 WHERE id=$2', [step, user.user_id]);
      }
      await db.query(
        `INSERT INTO sessions(token_hash,tenant_id,membership_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')`,
        [digest(raw), user.tenant_id, user.id],
      );
      await audit(db, user, req.correlationId, 'auth.login', user.id);
      return {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        employee_number: user.employee_number,
        tenant_name: user.tenant_name,
      };
    });
    res.cookie(COOKIE, raw, {
      httpOnly: true,
      secure: this.cfg.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1',
      maxAge: 8 * 60 * 60 * 1000,
    });
    return result;
  }
  @Post('activate')
  @HttpCode(200)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token', 'password'],
      properties: {
        token: { type: 'string' },
        password: { type: 'string', minLength: 12, maxLength: 128 },
      },
    },
  })
  async activate(@Body() body: unknown, @Req() req: ApiRequest) {
    await this.limit(`activate-ip:${req.ip}`, 20);
    const input = activateSchema.parse(body);
    const password = await hashPassword(input.password);
    await this.db.transaction(async (db) => {
      const { rows } = await db.query(
        `SELECT a.*,m.user_id,m.active membership_active,u.active user_active,t.active tenant_active
        FROM activation_tokens a JOIN memberships m ON m.tenant_id=a.tenant_id AND m.id=a.membership_id
        JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id
        WHERE a.token_hash=$1 AND a.used_at IS NULL AND a.expires_at>now() FOR UPDATE OF a,u`,
        [digest(input.token)],
      );
      const a = rows[0];
      if (!a || !a.membership_active || !a.user_active || !a.tenant_active)
        throw new UnauthorizedException('Kode aktivasi tidak valid atau kedaluwarsa.');
      await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [password, a.user_id]);
      await db.query(
        'UPDATE activation_tokens SET used_at=now() WHERE tenant_id=$1 AND membership_id=$2 AND used_at IS NULL',
        [a.tenant_id, a.membership_id],
      );
      await db.query('DELETE FROM sessions WHERE tenant_id=$1 AND membership_id=$2', [
        a.tenant_id,
        a.membership_id,
      ]);
      await db.query(
        'INSERT INTO audit_events(id,tenant_id,actor_id,action,object_id,correlation_id) VALUES($1,$2,$3,$4,$3,$5)',
        [randomUUID(), a.tenant_id, a.membership_id, 'auth.activate', req.correlationId],
      );
    });
    return { message: 'Akun aktif. Silakan masuk dengan ID karyawan.' };
  }
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: ApiRequest) {
    return req.actor;
  }
  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(@Req() req: ApiRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.transaction(async (db) => {
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.cookies[COOKIE])]);
      await audit(db, req.actor, req.correlationId, 'auth.logout', req.actor.id);
    });
    res.clearCookie(COOKIE, {
      path: '/api/v1',
      httpOnly: true,
      secure: this.cfg.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    return { message: 'Anda telah keluar.' };
  }
}
