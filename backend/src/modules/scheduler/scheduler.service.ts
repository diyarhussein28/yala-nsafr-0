import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, Between, IsNull, In } from 'typeorm';
import { Trip, TripStatus } from '../../database/entities/trip.entity';
import { Booking, BookingStatus } from '../../database/entities/booking.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { KashierService } from '../payments/kashier.service';
import { applyDriverCancellationStrike } from '../trips/driver-strikes';
import { restorePromoCredit } from '../bookings/booking-side-effects';
import { formatCairoTime } from '../../common/time/cairo';
import { Exclusive } from '../../common/jobs/exclusive';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly notifications: NotificationsService,
    private readonly kashier: KashierService,
  ) {}

  // ── Runs every 5 minutes ────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  @Exclusive()
  async handleTripLifecycle() {
    await Promise.all([
      this.sendPreDepartureReminders(),
      this.sendFinalWarnings(),
      this.autoCancelOverdueTrips(),
    ]);
  }

  // ── T-30 min reminder ───────────────────────────────────────────────────────
  // Finds scheduled trips departing within the next 32 minutes with no reminder sent yet.

  private async sendPreDepartureReminders() {
    const now = new Date();
    const window = new Date(now.getTime() + 32 * 60_000);

    const trips = await this.tripRepo.find({
      where: {
        status: TripStatus.SCHEDULED,
        departureTime: Between(now, window),
        reminderSentAt: IsNull(),
      },
      relations: { driver: true },
    });

    for (const trip of trips) {
      const route = `${trip.originCity} ← ${trip.destinationCity}`;
      const timeLabel = this._fmtTime(trip.departureTime);

      // Notify driver
      setImmediate(() =>
        void this.notifications.sendToUser(trip.driverId, {
          title: 'رحلتك تبدأ خلال 30 دقيقة 🚗',
          body: `${route} — الساعة ${timeLabel}. تأكد من جاهزيتك.`,
          data: { screen: 'trip_detail', tripId: trip.id },
        }),
      );

      // Notify all confirmed passengers
      const passengerIds = await this._confirmedPassengerIds(trip.id);
      if (passengerIds.length > 0) {
        setImmediate(() =>
          void this.notifications.sendToUsers(passengerIds, {
            title: 'رحلتك تبدأ خلال 30 دقيقة ⏰',
            body: `${route} — الساعة ${timeLabel}. كن مستعداً.`,
            data: { screen: 'my_bookings' },
          }),
        );
      }

      trip.reminderSentAt = new Date();
      await this.tripRepo.save(trip);
      this.logger.log(`T-30 reminder sent for trip ${trip.id}`);
    }
  }

  // ── T+30 final warning ──────────────────────────────────────────────────────
  // Finds trips that should have departed 28+ minutes ago, still not started, no warning sent.

  private async sendFinalWarnings() {
    const threshold = new Date(Date.now() - 28 * 60_000);

    const trips = await this.tripRepo.find({
      where: {
        status: TripStatus.SCHEDULED,
        departureTime: LessThan(threshold),
        finalWarningSentAt: IsNull(),
      },
    });

    for (const trip of trips) {
      const route = `${trip.originCity} ← ${trip.destinationCity}`;

      setImmediate(() =>
        void this.notifications.sendToUser(trip.driverId, {
          title: '⚠️ لم تبدأ رحلتك بعد',
          body: `رحلة ${route} تأخرت. لديك 15 دقيقة لبدء الرحلة وإلا ستُلغى تلقائياً وتُسترد مبالغ الركاب.`,
          data: { screen: 'trip_detail', tripId: trip.id },
        }),
      );

      trip.finalWarningSentAt = new Date();
      await this.tripRepo.save(trip);
      this.logger.log(`Final warning sent for trip ${trip.id}`);
    }
  }

  // ── T+45 auto-cancel ────────────────────────────────────────────────────────
  // Finds trips 43+ minutes past departure, still scheduled → auto-cancel with full refund.

  private async autoCancelOverdueTrips() {
    const threshold = new Date(Date.now() - 43 * 60_000);

    const trips = await this.tripRepo.find({
      where: {
        status: TripStatus.SCHEDULED,
        departureTime: LessThan(threshold),
      },
    });

    for (const trip of trips) {
      try {
        await this._autoCancelTrip(trip);
      } catch (e) {
        this.logger.error(`Auto-cancel failed for trip ${trip.id}: ${String(e)}`);
      }
    }
  }

  private async _autoCancelTrip(trip: Trip) {
    const route = `${trip.originCity} ← ${trip.destinationCity}`;
    const paymentsToRefund: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      const fresh = await manager.findOne(Trip, { where: { id: trip.id } });
      if (!fresh || fresh.status !== TripStatus.SCHEDULED) return;

      const bookings = await manager.find(Booking, {
        where: [
          { tripId: trip.id, status: BookingStatus.CONFIRMED },
          { tripId: trip.id, status: BookingStatus.IN_PROGRESS },
          { tripId: trip.id, status: BookingStatus.PENDING_DRIVER_APPROVAL },
          { tripId: trip.id, status: BookingStatus.PENDING_PAYMENT },
        ],
        relations: { payment: true },
      });

      const passengerIds: string[] = [];
      for (const booking of bookings) {
        // Collected, not settled here: returning the money needs a Kashier call, which
        // must not run inside this transaction. Marking the payment REFUNDED without
        // that call told passengers they had been repaid when nothing had moved.
        if (booking.payment && !booking.payment.isCash) {
          paymentsToRefund.push(booking.payment.id);
        }
        booking.status = BookingStatus.REFUNDED;
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'تم إلغاء الرحلة تلقائياً لعدم البدء في الموعد المحدد';
        await manager.save(Booking, booking);
        await restorePromoCredit(manager, booking);
        passengerIds.push(booking.passengerId);
      }

      fresh.status = TripStatus.CANCELLED;
      fresh.cancelledAt = new Date();
      fresh.cancellationReason = 'إلغاء تلقائي — لم يبدأ السائق الرحلة';
      await manager.save(Trip, fresh);

      // Increment driver's cancelled-trips counter + apply repeat-offender policy
      await manager.increment(User, { id: fresh.driverId }, 'cancelledTripsAsDriver', 1);
      const { notice } = await applyDriverCancellationStrike(manager, fresh.driverId);
      if (notice) {
        setImmediate(() => void this.notifications.sendToUser(fresh.driverId, notice));
      }

      this.logger.log(`Auto-cancelled trip ${trip.id} (driver ${trip.driverId})`);

      if (passengerIds.length > 0) {
        setImmediate(() =>
          void this.notifications.sendToUsers(passengerIds, {
            title: 'تم إلغاء رحلتك تلقائياً',
            body: `رحلة ${route} لم تنطلق في موعدها. سيتم استرداد مبلغك كاملاً خلال 24 ساعة.`,
            data: { screen: 'my_bookings' },
          }),
        );
      }

      // Warn the driver
      setImmediate(() =>
        void this.notifications.sendToUser(fresh.driverId, {
          title: 'تم إلغاء رحلتك تلقائياً',
          body: `رحلة ${route} أُلغيت لعدم البدء في الموعد. تجنب التكرار لأنه يؤثر على تقييمك.`,
          data: { screen: 'my_trips' },
        }),
      );
    });

    await this._returnFunds(paymentsToRefund, `trip ${trip.id} auto-cancelled`);
  }

  /**
   * Voids an authorized hold or refunds a captured payment, after the cancelling
   * transaction has committed. A gateway failure leaves the payment untouched and
   * logged, so it can be retried — never silently recorded as refunded.
   */
  private async _returnFunds(paymentIds: string[], context: string): Promise<void> {
    if (paymentIds.length === 0) return;

    const payments = await this.paymentRepo.findBy({ id: In(paymentIds) });
    for (const payment of payments) {
      if (payment.isCash) continue;
      const orderId = payment.gatewayTransactionId ?? payment.gatewayOrderId;
      if (!orderId) continue;

      try {
        if (payment.status === PaymentStatus.PENDING) {
          await this.kashier.releasePayment(orderId, payment.kashierTransactionId ?? undefined);
          payment.status = PaymentStatus.RELEASED;
          payment.releasedAt = new Date();
        } else if (payment.status === PaymentStatus.CAPTURED) {
          await this.kashier.refundPayment(orderId, Number(payment.amount));
          payment.status = PaymentStatus.REFUNDED;
          payment.refundAmount = Number(payment.amount);
          payment.refundedAt = new Date();
        } else {
          continue;
        }
        await this.paymentRepo.save(payment);
      } catch (err) {
        this.logger.error(
          `Failed to return funds for payment ${payment.id} (${context}, status ${payment.status}): ${err}`,
        );
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async _confirmedPassengerIds(tripId: string): Promise<string[]> {
    const bookings = await this.bookingRepo.find({
      where: [
        { tripId, status: BookingStatus.CONFIRMED },
        { tripId, status: BookingStatus.IN_PROGRESS },
        { tripId, status: BookingStatus.PENDING_DRIVER_APPROVAL },
      ],
      select: { passengerId: true },
    });
    return [...new Set(bookings.map((b) => b.passengerId))];
  }

  // Cairo time — the host's own clock is usually UTC, which printed departures 2–3h off
  private _fmtTime(date: Date): string {
    return formatCairoTime(date);
  }
}
