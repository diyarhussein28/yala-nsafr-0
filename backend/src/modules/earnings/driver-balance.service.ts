import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Booking, BookingStatus, PaymentMethod } from '../../database/entities/booking.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import {
  WithdrawalRequest,
  WithdrawalStatus,
} from '../../database/entities/withdrawal-request.entity';
import {
  DriverLedgerEntry,
  LedgerEntryType,
} from '../../database/entities/driver-ledger-entry.entity';
import { PlatformConfig, CONFIG_KEYS } from '../../database/entities/platform-config.entity';
import { startOfCairoMonth } from '../../common/time/cairo';

export const MIN_WITHDRAWAL = 200;
export const DEFAULT_CASH_COMMISSION_LIMIT_EGP = 500;
const DEFAULT_DISPUTE_WINDOW_HOURS = 48;

const round = (n: number) => Math.round(n * 100) / 100;

export interface DriverBalance {
  thisMonthOnline: number;
  thisMonthCash: number;
  allTimeOnline: number;
  allTimeCash: number;
  /** Withdrawable now */
  pendingBalance: number;
  /** Online earnings still inside their trip's dispute window */
  heldBalance: number;
  /** When the earliest held amount becomes withdrawable */
  nextReleaseAt: Date | null;
  totalWithdrawn: number;
  pendingWithdrawal: number;
  /** Commission on cash trips, all time */
  cashCommissionOwed: number;
  /** Of that, what has not been paid or netted yet */
  cashCommissionOutstanding: number;
  /** Compensation and admin adjustments credited from the ledger */
  ledgerCredits: number;
  /** Balance below zero: commission owed beyond what online earnings cover */
  amountOwed: number;
  cashCommissionLimit: number;
  minWithdrawal: number;
}

/**
 * Everything a driver is owed, from one place.
 *
 *   withdrawable = online earnings past their dispute window
 *                + ledger credits (late-cancel compensation, admin adjustments,
 *                  commission the driver paid in)
 *                − commission owed on cash trips
 *                − paid and in-flight withdrawals
 *
 * Three things changed from the previous calculation:
 *  - Cash-trip commission is netted. The driver collects the whole cash fare, so the
 *    platform's 10% was tracked per booking but never collected at all.
 *  - Online earnings are held until the trip's dispute window closes. A driver could
 *    withdraw a fare minutes after the trip, and a dispute refunded later came out of the
 *    platform's pocket.
 *  - Late-cancellation compensation, which drivers were told they would receive, is
 *    credited once the passenger's fee has actually been captured.
 */
@Injectable()
export class DriverBalanceService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalRepo: Repository<WithdrawalRequest>,
    @InjectRepository(DriverLedgerEntry)
    private readonly ledgerRepo: Repository<DriverLedgerEntry>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PlatformConfig)
    private readonly configRepo: Repository<PlatformConfig>,
  ) {}

  private async configNum(key: string, fallback: number): Promise<number> {
    const row = await this.configRepo.findOne({ where: { key } });
    const value = row ? Number(row.value) : NaN;
    return Number.isFinite(value) ? value : fallback;
  }

  async getBalance(driverId: string): Promise<DriverBalance> {
    const [bookings, withdrawals, ledger, disputeWindowHours, cashCommissionLimit] = await Promise.all([
      this.bookingRepo
        .createQueryBuilder('b')
        .innerJoin('b.trip', 't')
        .leftJoinAndSelect('b.payment', 'p')
        .where('t.driverId = :driverId', { driverId })
        .andWhere('b.status = :status', { status: BookingStatus.TRIP_COMPLETED })
        .getMany(),
      this.withdrawalRepo.find({
        where: [
          { driverId, status: WithdrawalStatus.PAID },
          { driverId, status: WithdrawalStatus.PENDING },
        ],
        select: { amount: true, status: true },
      }),
      this.ledgerRepo.find({ where: { driverId } }),
      this.configNum(CONFIG_KEYS.DISPUTE_WINDOW_HOURS, DEFAULT_DISPUTE_WINDOW_HOURS),
      this.configNum(CONFIG_KEYS.CASH_COMMISSION_LIMIT_EGP, DEFAULT_CASH_COMMISSION_LIMIT_EGP),
    ]);

    const startOfMonth = startOfCairoMonth();
    const releaseCutoff = Date.now() - disputeWindowHours * 3_600_000;

    let thisMonthOnline = 0, thisMonthCash = 0, allTimeOnline = 0, allTimeCash = 0;
    let availableOnline = 0, heldBalance = 0, cashCommissionOwed = 0;
    let nextReleaseAt: number | null = null;

    for (const b of bookings) {
      const isCash = b.paymentMethod === PaymentMethod.CASH;
      const payout = Number(b.driverPayoutAmount ?? 0);
      const total = Number(b.totalAmount ?? 0);
      const completedAt = new Date(b.completedAt ?? b.updatedAt).getTime();
      const isThisMonth = completedAt >= startOfMonth.getTime();

      if (isCash) {
        // Cash is collected by the driver directly — less anything a dispute ruling sent
        // back to the passenger, which the driver hands over themselves.
        const refunded = Number(b.payment?.refundAmount ?? 0);
        const kept = Math.max(0, +(total - refunded).toFixed(2));
        allTimeCash += kept;
        if (isThisMonth) thisMonthCash += kept;
        // No commission on a fare that was fully returned
        if (refunded < total) cashCommissionOwed += Number(b.commissionAmount ?? 0);
        continue;
      }

      // Online payouts only count once the money was actually captured
      let earned = 0;
      if (b.payment?.status === PaymentStatus.CAPTURED) {
        earned = payout;
      } else if (b.payment?.status === PaymentStatus.PARTIALLY_REFUNDED) {
        // A split ruling returns a slice to the passenger; the driver keeps the rest
        earned = Math.max(0, +(payout - Number(b.payment.refundAmount ?? 0)).toFixed(2));
      }
      if (earned <= 0) continue;

      allTimeOnline += earned;
      if (isThisMonth) thisMonthOnline += earned;
      if (completedAt <= releaseCutoff) {
        availableOnline += earned;
      } else {
        heldBalance += earned;
        const releaseAt = completedAt + disputeWindowHours * 3_600_000;
        if (nextReleaseAt === null || releaseAt < nextReleaseAt) nextReleaseAt = releaseAt;
      }
    }

    // Compensation only counts once the passenger's fee was really captured
    const compensationBookingIds = ledger
      .filter((e) => e.type === LedgerEntryType.CANCELLATION_COMPENSATION && e.bookingId)
      .map((e) => e.bookingId as string);
    const capturedFees = compensationBookingIds.length
      ? new Set(
          (
            await this.paymentRepo.find({
              where: {
                bookingId: In(compensationBookingIds),
                status: In([PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED]),
              },
              select: { bookingId: true },
            })
          ).map((p) => p.bookingId),
        )
      : new Set<string>();

    let ledgerCredits = 0;
    for (const entry of ledger) {
      const amount = Number(entry.amount);
      if (entry.type === LedgerEntryType.CANCELLATION_COMPENSATION) {
        if (entry.bookingId && capturedFees.has(entry.bookingId)) ledgerCredits += amount;
      } else {
        ledgerCredits += amount;
      }
    }

    const sum = (status: WithdrawalStatus) =>
      withdrawals.filter((w) => w.status === status).reduce((s, w) => s + Number(w.amount ?? 0), 0);
    const totalWithdrawn = sum(WithdrawalStatus.PAID);
    // A PENDING withdrawal is already handed to Kashier and not spendable
    const pendingWithdrawal = sum(WithdrawalStatus.PENDING);

    const raw = availableOnline + ledgerCredits - cashCommissionOwed - totalWithdrawn - pendingWithdrawal;

    // Commission still owed once every online earning (held ones included) is netted
    // against it — what a cash-heavy driver has to pay in.
    const cashCommissionOutstanding = Math.max(0, -(raw + heldBalance));

    return {
      thisMonthOnline: round(thisMonthOnline),
      thisMonthCash: round(thisMonthCash),
      allTimeOnline: round(allTimeOnline),
      allTimeCash: round(allTimeCash),
      pendingBalance: round(Math.max(0, raw)),
      heldBalance: round(heldBalance),
      nextReleaseAt: nextReleaseAt ? new Date(nextReleaseAt) : null,
      totalWithdrawn: round(totalWithdrawn),
      pendingWithdrawal: round(pendingWithdrawal),
      cashCommissionOwed: round(cashCommissionOwed),
      cashCommissionOutstanding: round(cashCommissionOutstanding),
      ledgerCredits: round(ledgerCredits),
      amountOwed: round(Math.max(0, -raw)),
      cashCommissionLimit: cashCommissionLimit,
      minWithdrawal: MIN_WITHDRAWAL,
    };
  }
}
