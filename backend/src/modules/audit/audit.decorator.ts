import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string;
  targetType: string;
  /** Route param holding the target id (default "id") */
  param?: string;
}

/** Marks an admin endpoint whose successful calls are written to the audit log. */
export const Audit = (action: string, targetType: string, param = 'id') =>
  SetMetadata(AUDIT_KEY, { action, targetType, param } satisfies AuditMeta);
