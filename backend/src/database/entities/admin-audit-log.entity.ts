import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * Who did what, as an admin, and when. Append-only: verification decisions, bans,
 * dispute rulings, money adjustments and config changes all move money or affect
 * people's access, and none of them left any trace before.
 */
@Entity('admin_audit_log')
@Index(['createdAt'])
@Index(['targetType', 'targetId'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin: User | null;

  /** e.g. user.verify_id.approve, dispute.resolve, config.update */
  @Column({ length: 60 })
  action: string;

  @Column({ name: 'target_type', length: 30 })
  targetType: string;

  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
