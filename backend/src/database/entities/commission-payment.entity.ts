import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum CommissionPaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

/** Prefix that marks a Kashier merchantOrderId as a cash-commission settlement. */
export const COMMISSION_ORDER_PREFIX = 'com-';

/**
 * A driver paying the commission they owe on cash trips. Cash fares never pass through
 * the platform, so a driver with no card trips had no way to settle — and nothing was
 * ever collected. Paid through Kashier; on confirmation a ledger entry offsets the debt.
 */
@Entity('commission_payments')
@Index(['driverId', 'createdAt'])
export class CommissionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id' })
  driverId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: CommissionPaymentStatus, default: CommissionPaymentStatus.PENDING })
  status: CommissionPaymentStatus;

  @Index({ unique: true })
  @Column({ name: 'merchant_order_id', length: 64 })
  merchantOrderId: string;

  @Column({ name: 'gateway_session_id', type: 'varchar', nullable: true })
  gatewaySessionId: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
