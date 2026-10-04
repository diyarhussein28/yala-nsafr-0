import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  /**
   * Records an admin action. Never throws: a failure to write the log is reported loudly
   * but must not undo or block the action itself, which has already happened.
   */
  async record(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.repo.save(this.repo.create({ adminId, action, targetType, targetId, details: details ?? null }));
    } catch (err) {
      this.logger.error(`Audit write failed for ${action} on ${targetType}:${targetId}: ${String(err)}`);
    }
  }

  async list(params: { page?: number; limit?: number; targetType?: string; targetId?: string; adminId?: string }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoin('a.admin', 'admin')
      .addSelect(['admin.id', 'admin.fullName', 'admin.phoneNumber'])
      .orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (params.targetType) qb.andWhere('a.target_type = :t', { t: params.targetType });
    if (params.targetId) qb.andWhere('a.target_id = :id', { id: params.targetId });
    if (params.adminId) qb.andWhere('a.admin_id = :admin', { admin: params.adminId });
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
