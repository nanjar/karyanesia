import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Database } from './database';
import { digest } from './crypto';
import { CONFIG, Config } from './config';
import type { ApiRequest } from './types';
export const COOKIE = 'karyanesia_session';
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const id = randomUUID();
  (req as ApiRequest).correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  res.setHeader('Cache-Control', 'no-store');
  next();
}
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(CONFIG) private cfg: Config) {}
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('Origin') !== this.cfg.WEB_ORIGIN
    )
      throw new ForbiddenException('Origin tidak diizinkan.');
    return true;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Database) private db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ApiRequest>();
    const raw = req.cookies?.[COOKIE];
    if (typeof raw !== 'string' || !/^[\w-]{43}$/.test(raw))
      throw new UnauthorizedException('Silakan masuk.');
    const { rows } = await this.db.query(
      `SELECT m.id,m.tenant_id,m.user_id,m.role,m.branch_id,m.employee_number,u.full_name,t.name tenant_name,
      ARRAY(SELECT g.branch_id::text FROM branch_grants g WHERE g.tenant_id=m.tenant_id AND g.membership_id=m.id) scopes
      FROM sessions s JOIN memberships m ON m.tenant_id=s.tenant_id AND m.id=s.membership_id
      JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND m.active AND u.active AND t.active`,
      [digest(raw)],
    );
    if (!rows[0]) throw new UnauthorizedException('Sesi berakhir. Silakan masuk kembali.');
    req.actor = rows[0];
    return true;
  }
}
