import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, AuditMeta } from './audit.decorator';
import { AuditService } from './audit.service';

/**
 * Writes an audit entry after an @Audit-marked endpoint succeeds. Failed or rejected
 * calls are not logged as actions — they did not happen. The request body is stored as
 * the entry's details (it is the admin's own input: a resolution, a note, a new value).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(() => {
        const adminId: string | undefined = req.user?.id;
        if (!adminId) return;
        const body = req.body && typeof req.body === 'object' ? req.body : undefined;
        const details = body && Object.keys(body).length ? JSON.parse(JSON.stringify(body)) : undefined;
        void this.audit.record(
          adminId,
          meta.action,
          meta.targetType,
          req.params?.[meta.param ?? 'id'] ?? null,
          details,
        );
      }),
    );
  }
}
