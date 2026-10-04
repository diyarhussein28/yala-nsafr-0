import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
