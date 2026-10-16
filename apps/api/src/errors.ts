import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { ApiRequest } from './types';
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private logger = new Logger('API');
  catch(e: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp(),
      req = ctx.getRequest<ApiRequest>(),
      res = ctx.getResponse<Response>();
    const correlation_id = req.correlationId || randomUUID();
    let status =
      e instanceof HttpException
        ? e.getStatus()
        : e instanceof ZodError
          ? 422
          : ['23505', '23503', '23514', '22P02'].includes(e.code)
            ? 422
            : 500;
    const codes: Record<number, string> = {
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
    };
    const payload = e instanceof HttpException ? e.getResponse() : null;
    const message =
      typeof payload === 'string'
        ? payload
        : (payload as { message?: string } | null)?.message ||
          (status === 422
            ? 'Data tidak valid atau referensi tidak sesuai.'
            : 'Terjadi kesalahan. Coba lagi.');
    if (status >= 500)
      this.logger.error(JSON.stringify({ correlation_id, code: e.code ?? 'INTERNAL_ERROR' }));
    res.status(status).json({
      code: codes[status] || 'REQUEST_ERROR',
      message,
      field_errors:
        e instanceof ZodError
          ? e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
          : [],
      correlation_id,
    });
  }
}
