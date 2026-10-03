import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Booking, BookingStatus, PaymentMethod } from '../../database/entities/booking.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { Trip, TripStatus } from '../../database/entities/trip.entity';
import { User, Gender, UserRole, UserStatus } from '../../database/entities/user.entity';
import {
  Dispute,
  DisputeStatus,
  MAX_DISPUTE_EVIDENCE,
} from '../../database/entities/dispute.entity';
import { PlatformConfig, CONFIG_KEYS } from '../../database/entities/platform-config.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { OpenDisputeDto } from '../admin/dto/open-dispute.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { KashierService } from '../payments/kashier.service';
import {
  PaymentSettlementService,
  PaymentSettlement,
} from '../payments/payment-settlement.service';
import { BlocksService } from '../blocks/blocks.service';
import { toBookedDriver, toPublicUser } from '../../common/serializers/public-user';
import {
  creditPassengerCompletion,
  REFERRAL_REWARD_EGP,
  restorePromoCredit,
} from './booking-side-effects';

// Auto-confirm 2 hours after departure time if no dispute
const AUTO_CONFIRM_HOURS = 2;

// How long a card booking may sit in PENDING_PAYMENT before its seats are released.
// Without an expiry, anyone could open checkout for every seat on a trip and never pay,
// and the trip would show as full until it was auto-cancelled.
export const PENDING_PAYMENT_TTL_MINUTES = 30;

// Bookings a passenger still holds on a trip. A second booking on top of one of these is
// refused — the app never offers it, and allowing it over the API let one passenger
// stack holds on the same trip.
const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING_PAYMENT,
  BookingStatus.PENDING_DRIVER_APPROVAL,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
];

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(PlatformConfig)
    private readonly configRepo: Repository<PlatformConfig>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly kashier: KashierService,
    private readonly settlement: PaymentSettlementService,
    private readonly blocks: BlocksService,
  ) {}

  private async getConfigNum(key: string, fallback: number): Promise<number> {
    const row = await this.configRepo.findOne({ where: { key } });
    return row ? parseFloat(row.value) : fallback;
  }

  /**
   * The cancellation thresholds the app must show before payment. Kashier's contract
   * requires a refund policy the customer can see and accept beforehand, and these are
   * admin-configurable — so they are read here rather than restated in the client.
   */
  async getCancellationPolicy() {
    const [
      freeCancelHours,
      lateCancelHours,
      lateCancelFeePct,
      disputeWindowHours,
      disputeSlaHours,
    ] = await Promise.all([
      this.getConfigNum(CONFIG_KEYS.FREE_CANCEL_HOURS, 48),
      this.getConfigNum(CONFIG_KEYS.LATE_CANCEL_HOURS, 2),
      this.getConfigNum(CONFIG_KEYS.LATE_CANCEL_FEE_PCT, 0.15),
      // Served here too so the dispute screen can state the real deadlines instead of a
      // hardcoded 48, which would be wrong the moment an admin changes either value.
      this.getConfigNum(CONFIG_KEYS.DISPUTE_WINDOW_HOURS, 48),
      this.getConfigNum(CONFIG_KEYS.DISPUTE_SLA_HOURS, 48),
    ]);
    return {
      freeCancelHours,
      lateCancelHours,
      lateCancelFeePct,
      disputeWindowHours,
      disputeSlaHours,
    };
  }

  /** Read-only: calculate what the passenger would get back if they cancel now. */
  async getCancelPreview(bookingId: string, passenger: User) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: { trip: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.passengerId !== passenger.id) throw new ForbiddenException('Not your booking');

    const canCancel =
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.PENDING_DRIVER_APPROVAL;

    const isCash = booking.paymentMethod === PaymentMethod.CASH;
    const now = new Date();
    const hoursUntil =
      (booking.trip.departureTime.getTime() - now.getTime()) / 3_600_000;
    const tripStarted = booking.trip.status === TripStatus.ACTIVE ||
                        booking.trip.status === TripStatus.COMPLETED;

    const [freeCancelHours, lateCancelHours, lateCancelFeePct] = await Promise.all([
      this.getConfigNum(CONFIG_KEYS.FREE_CANCEL_HOURS, 48),
      this.getConfigNum(CONFIG_KEYS.LATE_CANCEL_HOURS, 2),
      this.getConfigNum(CONFIG_KEYS.LATE_CANCEL_FEE_PCT, 0.15),
    ]);

    const total = booking.totalAmount;
    let policy: 'free_cancel' | 'late_cancel' | 'no_refund';
    let refundAmount: number;
    let cancellationFee: number;

    if (!canCancel || tripStarted) {
      policy = 'no_refund';
      refundAmount = 0;
      cancellationFee = 0;
    } else if (isCash || hoursUntil >= freeCancelHours) {
      policy = 'free_cancel';
      refundAmount = total;
      cancellationFee = 0;
    } else if (hoursUntil >= lateCancelHours) {
      policy = 'late_cancel';
      cancellationFee = +(total * lateCancelFeePct).toFixed(2);
      refundAmount = +(total - cancellationFee).toFixed(2);
    } else {
      policy = 'no_refund';
      refundAmount = 0;
      cancellationFee = total;
    }

    return {
      canCancel: canCancel && !tripStarted && hoursUntil > 0,
      policy,
      hoursUntilDeparture: +hoursUntil.toFixed(1),
      totalAmount: total,
      refundAmount,
      cancellationFee,
      isCash,
    };
  }

  async create(passenger: User, dto: CreateBookingDto): Promise<Booking & { paymentUrl?: string }> {
    const isCashBooking = !dto.paymentMethod || dto.paymentMethod === PaymentMethod.CASH;

    const freshPassenger = await this.dataSource.manager.findOne(User, {
      where: { id: passenger.id },
      select: { id: true, status: true, fullName: true, cashBookingRestrictedUntil: true },
    });

    // A suspended or banned account, or one that never finished profile setup, must not
    // be able to reserve seats — only trip posting used to check this.
    if (!freshPassenger || freshPassenger.status !== UserStatus.ACTIVE || !freshPassenger.fullName) {
      throw new ForbiddenException('أكمل ملفك الشخصي أو تواصل مع الدعم قبل الحجز');
    }

    // The restriction is on *cash* bookings: a passenger who cancels cash trips late can
    // still book with a card, where the cancellation policy actually costs them. It used
    // to block every booking while its message claimed only cash was affected.
    if (
      isCashBooking &&
      freshPassenger.cashBookingRestrictedUntil &&
      freshPassenger.cashBookingRestrictedUntil > new Date()
    ) {
      throw new BadRequestException(
        'أنت ممنوع مؤقتاً من حجز رحلات الكاش بسبب الإلغاء المتكرر — يمكنك الحجز بالبطاقة',
      );
    }

    let driverId = '';
    let originCity = '';
    let destinationCity = '';
    // Hoisted so the rollback below can give the credit back if checkout never opens
    let promoDiscount = 0;

    const booking = await this.dataSource.transaction(async (manager) => {
      const trip = await manager.findOne(Trip, {
        where: { id: dto.tripId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!trip) throw new NotFoundException('Trip not found');
      driverId = trip.driverId;
      originCity = trip.originCity;
      destinationCity = trip.destinationCity;

      if (trip.status !== TripStatus.SCHEDULED) {
        throw new BadRequestException('Trip is no longer available for booking');
      }
      // A trip stays SCHEDULED until the driver starts it or the scheduler cancels it,
      // which can be up to 45 minutes after departure — it must not take bookings then.
      if (new Date(trip.departureTime).getTime() <= Date.now()) {
        throw new BadRequestException('هذه الرحلة انطلق موعدها ولم تعد متاحة للحجز');
      }
      if (trip.driverId === passenger.id) {
        throw new BadRequestException('You cannot book your own trip');
      }
      const existingBooking = await manager.findOne(Booking, {
        where: {
          tripId: trip.id,
          passengerId: passenger.id,
          status: In(ACTIVE_BOOKING_STATUSES),
        },
        select: { id: true },
      });
      if (existingBooking) {
        throw new BadRequestException('لديك حجز قائم بالفعل على هذه الرحلة');
      }
      // Search hides blocked drivers, but a direct booking call did not check at all
      const [blockedByDriver, blockedByPassenger] = await Promise.all([
        this.blocks.isBlocked(trip.driverId, passenger.id),
        this.blocks.isBlocked(passenger.id, trip.driverId),
      ]);
      if (blockedByDriver || blockedByPassenger) {
        throw new ForbiddenException('لا يمكنك الحجز على هذه الرحلة');
      }
      if (trip.availableSeats < dto.seatsCount) {
        throw new BadRequestException(`Only ${trip.availableSeats} seat(s) remaining`);
      }
      if (trip.womenOnly && passenger.gender !== Gender.FEMALE) {
        throw new ForbiddenException('This trip is for women passengers only');
      }

      // platform_config is what the admin screen edits, so it has to win. Reading only
      // the env var meant a rate changed in the dashboard was silently ignored while
      // bookings kept charging the old one. Env is the fallback for a fresh database.
      const commissionRate = await this.getConfigNum(
        CONFIG_KEYS.COMMISSION_RATE,
        parseFloat(this.config.get<string>('DEFAULT_COMMISSION_RATE') ?? '0.10'),
      );
      const grossAmount = parseFloat(trip.pricePerSeat.toString()) * dto.seatsCount;

      // Apply promo balance if requested.
      // The row is locked for the rest of the transaction: the decrement below is atomic
      // on its own, but the decision of how much to grant is not. Without the lock two
      // simultaneous bookings could both read the same balance and both spend it.
      if (dto.usePromo) {
        const freshUser = await manager.findOne(User, {
          where: { id: passenger.id },
          select: { id: true, promoBalance: true },
          lock: { mode: 'pessimistic_write' },
        });
        const available = Number(freshUser?.promoBalance ?? 0);
        if (available > 0) {
          promoDiscount = +Math.min(available, grossAmount).toFixed(2);
        }
      }
      const totalAmount = +(grossAmount - promoDiscount).toFixed(2);

      // Commission is always on gross so driver payout never changes
      const commissionAmount = +(grossAmount * commissionRate).toFixed(2);
      const driverPayoutAmount = +(grossAmount - commissionAmount).toFixed(2);

      const autoConfirmAfter = new Date(trip.departureTime);
      autoConfirmAfter.setHours(autoConfirmAfter.getHours() + AUTO_CONFIRM_HOURS);

      const isOnline = dto.paymentMethod && dto.paymentMethod !== PaymentMethod.CASH;

      const booking = manager.create(Booking, {
        tripId: trip.id,
        passengerId: passenger.id,
        seatsCount: dto.seatsCount,
        totalAmount,
        commissionAmount,
        driverPayoutAmount,
        commissionRate,
        promoDiscountAmount: promoDiscount,
        paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
        status: isOnline ? BookingStatus.PENDING_PAYMENT : BookingStatus.PENDING_DRIVER_APPROVAL,
        autoConfirmAfter,
      });

      const savedBooking = await manager.save(Booking, booking);

      // Decrement promoBalance atomically inside the transaction
      if (promoDiscount > 0) {
        await manager.decrement(User, { id: passenger.id }, 'promoBalance', promoDiscount);
      }

      const payment = manager.create(Payment, {
        bookingId: savedBooking.id,
        amount: totalAmount,  // passenger pays reduced amount
        currency: 'EGP',
        status: isOnline ? PaymentStatus.PENDING : PaymentStatus.CAPTURED,
        isCash: !isOnline,
        gatewayName: isOnline ? 'kashier' : undefined,
        gatewayOrderId: isOnline ? savedBooking.id : undefined,
      });
      await manager.save(Payment, payment);

      trip.availableSeats -= dto.seatsCount;
      await manager.save(Trip, trip);

      return savedBooking;
    });

    // For online payments, create a Kashier payment session and return the URL
    const isOnline = dto.paymentMethod && dto.paymentMethod !== PaymentMethod.CASH;
    if (isOnline) {
      try {
        // Attach passenger so KashierService can pass customer details
        booking.passenger = passenger;
        const { sessionUrl, sessionId } = await this.kashier.createPaymentSession(booking);
        (booking as Booking & { paymentUrl?: string }).paymentUrl = sessionUrl;
        if (sessionId) {
          await this.paymentRepo.update({ bookingId: booking.id }, { gatewaySessionId: sessionId });
        }
      } catch (err) {
        // Roll back the booking so the user can retry
        await this.bookingRepo.update(booking.id, {
          status: BookingStatus.CANCELLED_BY_PASSENGER,
          cancellationReason: 'Payment session creation failed',
          cancelledAt: new Date(),
        });
        await this.tripRepo
          .createQueryBuilder()
          .update(Trip)
          .set({ availableSeats: () => `available_seats + ${booking.seatsCount}` })
          .where('id = :id', { id: booking.tripId })
          .execute();
        // The seats were given back but the promo credit was not, so a passenger whose
        // checkout failed to open simply lost it.
        if (promoDiscount > 0) {
          await this.dataSource.manager.increment(
            User,
            { id: passenger.id },
            'promoBalance',
            promoDiscount,
          );
          this.logger.log(
            `Restored ${promoDiscount} promo credit to ${passenger.id} after failed checkout`,
          );
        }
        throw new BadRequestException('فشل إنشاء جلسة الدفع. يرجى المحاولة مجدداً.');
      }
      // Don't notify driver yet — will notify after payment is authorized (via webhook)
      return booking as Booking & { paymentUrl: string };
    }

    // Notify driver of new cash booking request (fire-and-forget)
    setImmediate(() => {
      void this.notifications.sendToUser(driverId, {
        title: 'طلب حجز جديد',
        body: `لديك طلب حجز جديد على رحلتك من ${originCity} إلى ${destinationCity} — لديك 30 دقيقة للرد`,
        data: { bookingId: booking.id, tripId: booking.tripId, screen: 'trip_passengers' },
      });
    });

    return booking;
  }

  async approveBooking(bookingId: string, driver: User): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: bookingId, status: BookingStatus.PENDING_DRIVER_APPROVAL },
        relations: { trip: true },
      });
      if (!booking) throw new NotFoundException('Booking not found or not pending approval');
      if (booking.trip.driverId !== driver.id) {
        throw new ForbiddenException('Not your trip');
      }

      booking.status = BookingStatus.CONFIRMED;
      booking.confirmedAt = new Date();
      const saved = await manager.save(Booking, booking);

      setImmediate(() => {
        void this.notifications.sendToUser(booking.passengerId, {
          title: 'تمت الموافقة على حجزك ✅',
          body: `تمت الموافقة على حجزك في رحلة ${booking.trip.originCity} إلى ${booking.trip.destinationCity}`,
          data: { bookingId: booking.id, tripId: booking.tripId, screen: 'my_bookings' },
        });
      });

      return saved;
    });
  }

  async rejectBooking(bookingId: string, driver: User): Promise<Booking> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: bookingId, status: BookingStatus.PENDING_DRIVER_APPROVAL },
        relations: { trip: true },
      });
      if (!booking) throw new NotFoundException('Booking not found or not pending approval');
      if (booking.trip.driverId !== driver.id) {
        throw new ForbiddenException('Not your trip');
      }

      booking.status = BookingStatus.CANCELLED_BY_DRIVER;
      booking.cancelledAt = new Date();
      const result = await manager.save(Booking, booking);
      await restorePromoCredit(manager, booking);

      // Restore seats
      await manager
        .createQueryBuilder()
        .update(Trip)
        .set({ availableSeats: () => `available_seats + ${booking.seatsCount}` })
        .where('id = :id', { id: booking.tripId })
        .execute();

      setImmediate(() => {
        void this.notifications.sendToUser(booking.passengerId, {
          title: 'طلب الحجز مرفوض',
          body: 'عذراً، رفض السائق طلب حجزك',
          data: { bookingId: booking.id, tripId: booking.tripId, screen: 'my_bookings' },
        });
      });

      return result;
    });

    // Outside the transaction: the passenger never got the ride, so give the money
    // back. Kept out of the transaction so a slow gateway call doesn't hold locks.
    await this.returnFundsForRejectedBooking(bookingId);

    return saved;
  }

  /**
   * Returns a rejected booking's money. Voids when the amount was only authorized,
   * refunds when it was already captured — which of those applies depends on whether
   * Kashier has Authorization Capture enabled, so both must be handled.
   * Leaves the payment untouched on failure so it stays visible for a retry.
   */
  private async returnFundsForRejectedBooking(bookingId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { bookingId } });
    if (!payment || payment.isCash) return;

    const orderId = payment.gatewayTransactionId ?? payment.gatewayOrderId;
    if (!orderId) return;

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
        return; // already released, refunded or failed — nothing owed
      }
      await this.paymentRepo.save(payment);
    } catch (err) {
      this.logger.error(
        `Failed to return funds for rejected booking ${bookingId} ` +
          `(payment ${payment.id}, status ${payment.status}): ${err}`,
      );
    }
  }

  /** Runs every 5 minutes — auto-rejects bookings pending for over 30 minutes */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoRejectExpiredBookings(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    const expired = await this.bookingRepo.find({
      where: {
        status: BookingStatus.PENDING_DRIVER_APPROVAL,
        createdAt: LessThan(cutoff),
      },
    });

    for (const booking of expired) {
      const rejected = await this.dataSource.transaction(async (manager) => {
        // Conditional on the status still being pending: the driver may have approved
        // this booking after the list above was read. Saving the stale entity used to
        // overwrite that approval with a rejection and void a paid passenger's hold.
        const result = await manager
          .createQueryBuilder()
          .update(Booking)
          .set({
            status: BookingStatus.CANCELLED_BY_DRIVER,
            cancelledAt: new Date(),
            cancellationReason: 'انتهت مهلة موافقة السائق',
          })
          .where('id = :id AND status = :pending', {
            id: booking.id,
            pending: BookingStatus.PENDING_DRIVER_APPROVAL,
          })
          .execute();
        if (!result.affected) return false;

        await manager
          .createQueryBuilder()
          .update(Trip)
          .set({ availableSeats: () => `available_seats + ${booking.seatsCount}` })
          .where('id = :id', { id: booking.tripId })
          .execute();
        await restorePromoCredit(manager, booking);
        return true;
      });
      if (!rejected) continue;

      // The driver never responded, so the passenger must not stay out of pocket
      await this.returnFundsForRejectedBooking(booking.id);

      setImmediate(() => {
        void this.notifications.sendToUser(booking.passengerId, {
          title: 'انتهت مهلة الموافقة',
          body: 'انتهت مهلة الموافقة على حجزك',
          data: { bookingId: booking.id, tripId: booking.tripId, screen: 'my_bookings' },
        });
      });
    }
  }

  /**
   * Releases seats held by card bookings whose checkout was never completed. Before
   * giving up, Kashier is asked whether the payment actually went through (the webhook
   * may simply have been lost) — a paid booking is moved on to the driver instead.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireAbandonedPayments(): Promise<void> {
    const cutoff = new Date(Date.now() - PENDING_PAYMENT_TTL_MINUTES * 60 * 1000);
    const stale = await this.bookingRepo.find({
      where: { status: BookingStatus.PENDING_PAYMENT, createdAt: LessThan(cutoff) },
      relations: { payment: true, trip: true },
    });

    for (const booking of stale) {
      try {
        const kashierStatus =
          (await this.kashier.getPaymentStatus(booking.payment?.gatewaySessionId)) ??
          (await this.kashier.getOrderStatus(booking.payment?.gatewayOrderId));
        if (
          kashierStatus === 'AUTHORIZED' ||
          kashierStatus === 'CAPTURED' ||
          kashierStatus === 'SUCCESS'
        ) {
          await this.markPaidAndNotifyDriver(booking);
          continue;
        }

        const expired = await this.dataSource.transaction(async (manager) => {
          const result = await manager
            .createQueryBuilder()
            .update(Booking)
            .set({
              status: BookingStatus.CANCELLED_BY_PASSENGER,
              cancelledAt: new Date(),
              cancellationReason: 'انتهت مهلة إتمام الدفع',
            })
            .where('id = :id AND status = :pending', {
              id: booking.id,
              pending: BookingStatus.PENDING_PAYMENT,
            })
            .execute();
          if (!result.affected) return false;

          await manager
            .createQueryBuilder()
            .update(Trip)
            .set({ availableSeats: () => `available_seats + ${booking.seatsCount}` })
            .where('id = :id', { id: booking.tripId })
            .execute();
          if (booking.payment && booking.payment.status === PaymentStatus.PENDING) {
            await manager.update(Payment, booking.payment.id, { status: PaymentStatus.FAILED });
          }
          await restorePromoCredit(manager, booking);
          return true;
        });

        if (expired) {
          this.logger.log(`Expired unpaid booking ${booking.id} — seats released`);
          setImmediate(() => {
            void this.notifications.sendToUser(booking.passengerId, {
              title: 'انتهت مهلة الدفع',
              body: 'لم يكتمل الدفع في الوقت المحدد فتم إلغاء الحجز. يمكنك الحجز مرة أخرى إن كانت المقاعد متاحة.',
              data: { bookingId: booking.id, tripId: booking.tripId, screen: 'my_bookings' },
            });
          });
        }
      } catch (err) {
        this.logger.error(`Failed to expire unpaid booking ${booking.id}: ${String(err)}`);
      }
    }
  }

  /** PENDING_PAYMENT → PENDING_DRIVER_APPROVAL once payment is confirmed, guarded on status. */
  private async markPaidAndNotifyDriver(booking: Booking): Promise<boolean> {
    const result = await this.bookingRepo
      .createQueryBuilder()
      .update(Booking)
      .set({ status: BookingStatus.PENDING_DRIVER_APPROVAL })
      .where('id = :id AND status = :pending', {
        id: booking.id,
        pending: BookingStatus.PENDING_PAYMENT,
      })
      .execute();
    if (!result.affected) return false;

    if (booking.payment) {
      await this.paymentRepo.update(booking.payment.id, { status: PaymentStatus.PENDING });
    }
    this.logger.log(`Booking ${booking.id} confirmed paid → pending_driver_approval`);
    if (booking.trip?.driverId) {
      setImmediate(() => void this.notifications.sendToUser(booking.trip.driverId, {
        title: 'طلب حجز جديد 🎉',
        body: `راكب دفع ${booking.totalAmount} ج وينتظر موافقتك`,
        data: { screen: 'driver_bookings', tripId: booking.tripId },
      }));
    }
    return true;
  }

  async confirmCompletion(bookingId: string, user: User): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: bookingId },
        relations: { trip: true },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException('Booking is not in confirmed state');
      }

      const isDriver = booking.trip.driverId === user.id;
      const isPassenger = booking.passengerId === user.id;

      if (!isDriver && !isPassenger) throw new ForbiddenException('Not your booking');

      if (isDriver) booking.driverConfirmedCompletion = true;
      if (isPassenger) booking.passengerConfirmedCompletion = true;

      const bothConfirmed =
        booking.driverConfirmedCompletion && booking.passengerConfirmedCompletion;

      if (bothConfirmed) {
        await this.releaseEscrow(manager, booking);
      } else {
        await manager.save(Booking, booking);
      }

      return booking;
    });
  }

  private async releaseEscrow(manager: EntityManager, booking: Booking): Promise<void> {
    booking.status = BookingStatus.TRIP_COMPLETED;
    booking.completedAt = new Date();
    await manager.save(Booking, booking);

    const payment = await manager.findOne(Payment, { where: { bookingId: booking.id } });
    if (payment && !payment.isCash && payment.gatewayOrderId) {
      // Capture the full amount — platform keeps commission, credits driver's balance separately
      try {
        await this.kashier.capturePayment(payment.gatewayOrderId, Number(booking.totalAmount));
        payment.status = PaymentStatus.CAPTURED;
        payment.capturedAt = new Date();
        await manager.save(Payment, payment);
      } catch (err) {
        this.logger.error?.(`Failed to capture Kashier payment for booking ${booking.id}: ${err}`);
      }
    }

    // Update driver stats
    await manager
      .createQueryBuilder()
      .update('users')
      .set({ completedTripsAsDriver: () => 'completed_trips_as_driver + 1' })
      .where('id = (SELECT driver_id FROM trips WHERE id = :tripId)', { tripId: booking.tripId })
      .execute();

    const rewardedReferrers = await creditPassengerCompletion(manager, [booking.passengerId]);
    for (const referrerId of rewardedReferrers) {
      setImmediate(() => {
        void this.notifications.sendToUser(referrerId, {
          title: 'مكافأة الدعوة',
          body: `رفيقك أكمل أول رحلة — حصلت على ${REFERRAL_REWARD_EGP} جنيه في رصيدك!`,
          data: { screen: 'my_bookings' },
        });
      });
    }
  }

  async cancelByPassenger(
    bookingId: string,
    passenger: User,
    reason?: string,
  ): Promise<Booking & { refundAmount: number; policy: string }> {
    let settlement: PaymentSettlement | null = null;

    const result = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: bookingId },
        relations: { trip: true },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.passengerId !== passenger.id) throw new ForbiddenException('Not your booking');

      const wasConfirmed = booking.status === BookingStatus.CONFIRMED;

      if (
        booking.status !== BookingStatus.CONFIRMED &&
        booking.status !== BookingStatus.PENDING_DRIVER_APPROVAL
      ) {
        throw new BadRequestException('Cannot cancel in current state');
      }
      if (
        booking.trip.status === TripStatus.ACTIVE ||
        booking.trip.status === TripStatus.COMPLETED
      ) {
        throw new BadRequestException('Cannot cancel a trip that has already started');
      }

      const isCash = booking.paymentMethod === PaymentMethod.CASH;
      const now = new Date();
      const hoursUntil =
        (booking.trip.departureTime.getTime() - now.getTime()) / 3_600_000;

      const [freeCancelHours, lateCancelHours, lateCancelFeePct, driverCompPct] =
        await Promise.all([
          this.getConfigNum(CONFIG_KEYS.FREE_CANCEL_HOURS, 48),
          this.getConfigNum(CONFIG_KEYS.LATE_CANCEL_HOURS, 2),
          this.getConfigNum(CONFIG_KEYS.LATE_CANCEL_FEE_PCT, 0.15),
          this.getConfigNum(CONFIG_KEYS.DRIVER_COMPENSATION_PCT, 0.05),
        ]);

      const total = booking.totalAmount;
      let policy: string;
      let refundAmount: number;
      let driverBonus = 0;

      // If booking was still pending approval, free cancel always
      if (!wasConfirmed || isCash || hoursUntil >= freeCancelHours) {
        policy = 'free_cancel';
        refundAmount = total;
      } else if (hoursUntil >= lateCancelHours) {
        policy = 'late_cancel';
        const fee = +(total * lateCancelFeePct).toFixed(2);
        refundAmount = +(total - fee).toFixed(2);
        driverBonus = +(total * driverCompPct).toFixed(2);
      } else {
        policy = 'no_refund';
        refundAmount = 0;
      }

      // Restore seats to the trip
      await manager
        .createQueryBuilder()
        .update(Trip)
        .set({ availableSeats: () => `available_seats + ${booking.seatsCount}` })
        .where('id = :id', { id: booking.tripId })
        .execute();

      // Decide what the gateway has to do, but do not call it here. These calls used to
      // run inside this transaction: a late cancellation captured the fare and then
      // refunded it, so a failing refund rolled the database back while the capture had
      // already happened at Kashier — the passenger was charged with no record of it.
      const payment = await manager.findOne(Payment, { where: { bookingId } });
      if (payment && !isCash) {
        const orderId = payment.gatewayTransactionId ?? payment.gatewayOrderId;
        const targetTransactionId = payment.kashierTransactionId ?? undefined;

        if (payment.status === PaymentStatus.PENDING) {
          if (policy === 'free_cancel') {
            // Voiding an authorization is exempt from Kashier's same-day void window
            settlement = { paymentId: payment.id, orderId, targetTransactionId, action: 'void' };
          } else if (policy === 'late_cancel') {
            settlement = {
              paymentId: payment.id,
              orderId,
              action: 'capture_then_refund',
              captureAmount: Number(payment.amount),
              refundAmount,
            };
          } else {
            // no_refund: capture the full amount, the driver keeps it
            settlement = {
              paymentId: payment.id,
              orderId,
              action: 'capture',
              captureAmount: Number(payment.amount),
            };
          }
        } else if (payment.status === PaymentStatus.CAPTURED && refundAmount > 0) {
          settlement = {
            paymentId: payment.id,
            orderId,
            action: 'refund',
            refundAmount: refundAmount >= Number(total) ? Number(total) : refundAmount,
            fullRefund: refundAmount >= Number(total),
          };
        }
        // no_refund on an already-captured payment needs no gateway call
      }

      // Restore promo discount to passenger's balance on free cancellation
      if (policy === 'free_cancel' && Number(booking.promoDiscountAmount) > 0) {
        await manager.increment(User, { id: passenger.id }, 'promoBalance', Number(booking.promoDiscountAmount));
      }

      booking.status =
        refundAmount > 0 ? BookingStatus.REFUNDED : BookingStatus.CANCELLED_BY_PASSENGER;
      booking.cancelledAt = new Date();
      booking.cancellationReason = reason ?? '';
      const saved = await manager.save(Booking, booking);

      // Strike system — late cancellation of a confirmed booking
      if (hoursUntil < 24 && wasConfirmed) {
        const passengerData = await manager.findOne(User, {
          where: { id: booking.passengerId },
          select: { id: true, cancellationStrikes: true },
        });
        const newStrikes = ((passengerData?.cancellationStrikes ?? 0) + 1);
        if (newStrikes >= 3) {
          const restrictedUntil = new Date();
          restrictedUntil.setDate(restrictedUntil.getDate() + 30);
          await manager.update(User, { id: booking.passengerId }, {
            cancellationStrikes: 0,
            cashBookingRestrictedUntil: restrictedUntil,
          });
        } else {
          await manager.update(User, { id: booking.passengerId }, {
            cancellationStrikes: newStrikes,
          });
        }
        setImmediate(() => {
          void this.notifications.sendToUser(booking.passengerId, {
            title: 'تحذير: إلغاء متأخر',
            body: 'تحذير: لديك تحذير إلغاء متأخر',
            data: { screen: 'my_bookings' },
          });
        });
      }

      // Notify driver
      setImmediate(() => {
        const passengerName = passenger.fullName || passenger.phoneNumber;
        const seatsWord = booking.seatsCount === 1 ? 'مقعد' : 'مقاعد';
        const bonusNote = driverBonus > 0 ? ` وستحصل على ${driverBonus} جنيه تعويضاً` : '';
        void this.notifications.sendToUser(booking.trip.driverId, {
          title: 'إلغاء حجز',
          body: `${passengerName} ألغى حجز ${booking.seatsCount} ${seatsWord}${bonusNote}`,
          data: { bookingId: booking.id, tripId: booking.tripId, screen: 'trip_passengers' },
        });
      });

      return Object.assign(saved, { refundAmount, policy });
    });

    // Settled after the booking is safely cancelled. A gateway outage must not keep the
    // passenger on a booking they cancelled, so the money is reconciled separately.
    await this.settlement.settle(settlement, 'cancelled booking');

    return result;
  }


  async getPassengerBookings(passengerId: string): Promise<(Booking & { hasRated: boolean })[]> {
    const bookings = await this.bookingRepo.find({
      where: { passengerId },
      relations: { trip: { driver: true } },
      order: { createdAt: 'DESC' },
    });
    if (bookings.length === 0) return [];

    const bookingIds = bookings.map((b) => b.id);
    const ratedRows = await this.dataSource.query<Array<{ booking_id: string }>>(
      `SELECT booking_id FROM ratings WHERE rater_id = $1 AND booking_id = ANY($2)`,
      [passengerId, bookingIds],
    );
    const ratedSet = new Set(ratedRows.map((r) => r.booking_id));
    return bookings.map((b) => ({
      ...b,
      trip: b.trip ? { ...b.trip, driver: toBookedDriver(b.trip.driver) } : b.trip,
      hasRated: ratedSet.has(b.id),
    })) as unknown as (Booking & { hasRated: boolean })[];
  }

  /**
   * One booking, for its passenger, the trip's driver or an admin. This endpoint used to
   * answer any signed-in user for any booking id, with both parties' full user records
   * attached — phone numbers, national ID numbers and photos included.
   */
  async findById(id: string, viewer: User) {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { trip: { driver: true }, passenger: true, payment: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isPassenger = booking.passengerId === viewer.id;
    const isDriver = booking.trip?.driverId === viewer.id;
    if (!isPassenger && !isDriver && viewer.role !== UserRole.ADMIN) {
      // Same answer as a missing booking, so ids cannot be probed for existence
      throw new NotFoundException('Booking not found');
    }

    // Webhook recovery: if still pending_payment, check Kashier directly
    if (booking.status === BookingStatus.PENDING_PAYMENT && booking.payment?.gatewaySessionId) {
      const kashierStatus = await this.kashier.getPaymentStatus(booking.payment.gatewaySessionId);
      if (kashierStatus === 'AUTHORIZED' || kashierStatus === 'CAPTURED') {
        if (await this.markPaidAndNotifyDriver(booking)) {
          booking.status = BookingStatus.PENDING_DRIVER_APPROVAL;
          booking.payment.status = PaymentStatus.PENDING;
        }
      }
    }

    if (viewer.role === UserRole.ADMIN && !isPassenger && !isDriver) return booking;

    // The raw gateway payload is internal bookkeeping, not something either party needs
    const payment = booking.payment
      ? (({ gatewayResponse: _omit, ...rest }) => rest)(booking.payment)
      : booking.payment;
    return {
      ...booking,
      payment,
      passenger: toPublicUser(booking.passenger),
      trip: booking.trip
        ? { ...booking.trip, driver: toBookedDriver(booking.trip.driver) }
        : booking.trip,
    };
  }

  // Called from the in-app WebView after it intercepts Kashier's payment redirect.
  //
  // The caller controls both arguments, so neither is evidence of payment: without the
  // ownership check any signed-in user could heal someone else's booking, and without
  // asking Kashier directly an invented orderId would mark an unpaid booking as paid.
  // Kashier's own guidance is to confirm every payment server-side before releasing
  // goods, so the redirect only triggers the check — it never supplies the answer.
  async healFromRedirect(
    bookingId: string,
    kashierOrderId: string,
    passenger: User,
  ): Promise<{ healed: boolean }> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: { payment: true, trip: true },
    });
    if (!booking) return { healed: false };

    if (booking.passengerId !== passenger.id) {
      throw new ForbiddenException('Not your booking');
    }

    if (!booking.payment || booking.status !== BookingStatus.PENDING_PAYMENT) {
      return { healed: false };
    }

    const kashierStatus = await this.kashier.getPaymentStatus(booking.payment.gatewaySessionId);
    const paid =
      kashierStatus === 'AUTHORIZED' ||
      kashierStatus === 'CAPTURED' ||
      kashierStatus === 'SUCCESS';
    if (!paid) {
      this.logger.warn(
        `healFromRedirect refused for booking ${bookingId}: Kashier reports ` +
          `${kashierStatus ?? 'unknown'} for session ${booking.payment.gatewaySessionId ?? 'none'}`,
      );
      return { healed: false };
    }

    // The order id comes from the client and is what later capture, void and refund calls
    // are addressed to. It used to be stored unconditionally — even for unpaid bookings —
    // so a caller could point their payment at someone else's order. It is now only a
    // fallback for a payment with no gateway id yet; the signed webhook, which carries
    // Kashier's own value, overwrites it when it arrives.
    if (kashierOrderId && !booking.payment.gatewayTransactionId) {
      await this.paymentRepo.update(booking.payment.id, { gatewayTransactionId: kashierOrderId });
    }

    const healed = await this.markPaidAndNotifyDriver(booking);
    if (healed) {
      this.logger.log(`healFromRedirect: booking ${bookingId} → pending_driver_approval`);
    }
    return { healed };
  }

  async openDispute(user: User, dto: OpenDisputeDto): Promise<Dispute> {
    return this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: dto.bookingId },
        relations: { trip: true },
      });

      if (!booking) throw new NotFoundException('Booking not found');

      const isDriver = booking.trip.driverId === user.id;
      const isPassenger = booking.passengerId === user.id;
      if (!isDriver && !isPassenger) throw new ForbiddenException('Not your booking');

      if (
        booking.status !== BookingStatus.CONFIRMED &&
        booking.status !== BookingStatus.TRIP_COMPLETED
      ) {
        throw new BadRequestException('Can only dispute confirmed or completed bookings');
      }

      const existing = await manager.findOne(Dispute, { where: { bookingId: dto.bookingId } });
      if (existing) throw new BadRequestException('A dispute already exists for this booking');

      if ((dto.evidenceUrls?.length ?? 0) > MAX_DISPUTE_EVIDENCE) {
        throw new BadRequestException(
          `Attach at most ${MAX_DISPUTE_EVIDENCE} pieces of evidence`,
        );
      }

      const [disputeWindowHours, slaHours] = await Promise.all([
        this.getConfigNum(CONFIG_KEYS.DISPUTE_WINDOW_HOURS, 48),
        this.getConfigNum(CONFIG_KEYS.DISPUTE_SLA_HOURS, 48),
      ]);

      // The dispute window exists because the money behind a dispute has to still be
      // movable: an authorization lapses and Kashier will not refund a capture forever.
      // Measured from completion where we have it, otherwise from departure; a trip that
      // has not run yet gives a negative age and is always disputable.
      const reference = booking.completedAt ?? booking.trip.departureTime;
      const hoursSinceTrip = (Date.now() - reference.getTime()) / 3_600_000;
      if (hoursSinceTrip > disputeWindowHours) {
        throw new BadRequestException(
          `Disputes must be opened within ${disputeWindowHours} hours of the trip`,
        );
      }

      const slaDeadline = new Date();
      slaDeadline.setTime(slaDeadline.getTime() + slaHours * 3_600_000);

      booking.status = BookingStatus.DISPUTED;
      await manager.save(Booking, booking);

      const dispute = manager.create(Dispute, {
        bookingId: dto.bookingId,
        tripId: booking.tripId,
        openedByUserId: user.id,
        reason: dto.reason,
        description: dto.description,
        evidenceUrls: dto.evidenceUrls ?? [],
        status: DisputeStatus.OPEN,
        slaDeadline,
      });

      const saved = await manager.save(Dispute, dispute);

      booking.disputeId = saved.id;
      await manager.save(Booking, booking);

      const otherPartyId = isDriver ? booking.passengerId : booking.trip.driverId;
      await manager
        .createQueryBuilder()
        .update(User)
        .set({ disputeCount: () => 'dispute_count + 1' })
        .where('id = :id', { id: otherPartyId })
        .execute();

      setImmediate(() => {
        void this.notifications.sendToUser(otherPartyId, {
          title: 'تم فتح نزاع على رحلتك',
          body: `تم فتح نزاع على أحد حجوزاتك. يُرجى إرسال ردك خلال ${slaHours} ساعة.`,
          data: { disputeId: saved.id, bookingId: booking.id, screen: 'dispute_detail' },
        });
      });

      return saved;
    });
  }

  // Dev-only: simulate Kashier authorization webhook for a PENDING_PAYMENT booking
  async mockConfirmPayment(bookingId: string, passengerId?: string): Promise<void> {
    if (!this.kashier.isMock) return;

    const payment = await this.dataSource.manager.findOne(Payment, {
      where: { gatewayOrderId: bookingId },
    });
    if (!payment) return;

    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking || booking.status !== BookingStatus.PENDING_PAYMENT) return;
    if (passengerId && booking.passengerId !== passengerId) return;

    payment.status = PaymentStatus.PENDING;
    await this.dataSource.manager.save(Payment, payment);

    booking.status = BookingStatus.PENDING_DRIVER_APPROVAL;
    await this.bookingRepo.save(booking);

    this.logger.log(`Mock confirmed payment for booking ${bookingId}`);
  }
}
