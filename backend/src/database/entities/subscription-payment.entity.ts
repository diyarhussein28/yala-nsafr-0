import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SubscriptionPaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

/** Prefix that marks a Kashier merchantOrderId as a subscription purchase, not a booking. */
export const SUBSCRIPTION_ORDER_PREFIX = 'sub-';

/**
 * One purchase of a subscription period through Kashier. Charged immediately (no
 * authorize-and-capture hold like trip fares) and only applied to the subscription once
 * Kashier confirms it — by signed webhook, or by asking Kashier directly.
 */
@Entity('subscription_payments')
@Index(['userId', 'createdAt'])
export class SubscriptionPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'period_days', type: 'smallint' })
  periodDays: number;

  @Column({
    type: 'enum',
    enum: SubscriptionPaymentStatus,
    default: SubscriptionPaymentStatus.PENDING,
  })
  status: SubscriptionPaymentStatus;

  // What Kashier knows this order as: SUBSCRIPTION_ORDER_PREFIX + id
  @Index({ unique: true })
  @Column({ name: 'merchant_order_id', length: 64 })
  merchantOrderId: string;

  @Column({ name: 'gateway_session_id', type: 'varchar', nullable: true })
  gatewaySessionId: string | null;

  @Column({ name: 'kashier_order_id', type: 'varchar', nullable: true })
  kashierOrderId: string | null;

  @Column({ name: 'kashier_transaction_id', type: 'varchar', nullable: true })
  kashierTransactionId: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  // The period this payment bought, recorded when it was applied
  @Column({ name: 'period_start', type: 'timestamptz', nullable: true })
  periodStart: Date | null;

  @Column({ name: 'period_end', type: 'timestamptz', nullable: true })
  periodEnd: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
