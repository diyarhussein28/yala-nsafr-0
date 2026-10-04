import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum LedgerEntryType {
  /** Driver's share of a passenger's late-cancellation fee (+) */
  CANCELLATION_COMPENSATION = 'cancellation_compensation',
  /** Driver paid the platform commission owed on cash trips (+, offsets the debt) */
  CASH_COMMISSION_PAYMENT = 'cash_commission_payment',
  /** Manual correction by an admin (+ or −), always with a note */
  ADJUSTMENT = 'adjustment',
}

/**
 * Money movements on a driver's balance that are not a trip fare or a withdrawal.
 * Trip earnings and withdrawals are derived from bookings and withdrawal requests; this
 * append-only table holds everything else, so every change to what a driver is owed has
 * a dated, attributable record. Amounts are signed: positive is owed to the driver.
 *
 * Replaces the old driver_wallet table, which had running-balance columns but was never
 * written to by any code path.
 */
@Entity('driver_ledger')
@Index(['driverId', 'createdAt'])
export class DriverLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id' })
  driverId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({ type: 'enum', enum: LedgerEntryType })
  type: LedgerEntryType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  // For compensation: the cancelled booking. Credited only once its fee was captured.
  @Index()
  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  // For commission payments made through Kashier
  @Column({ name: 'commission_payment_id', type: 'uuid', nullable: true, unique: true })
  commissionPaymentId: string | null;

  @Column({ name: 'created_by_admin_id', type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
