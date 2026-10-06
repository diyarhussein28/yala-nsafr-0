import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, DataSource, In, FindOptionsWhere } from 'typeorm';
import { Trip, TripStatus } from '../../database/entities/trip.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { Booking, BookingStatus, PARTICIPANT_BOOKING_STATUSES } from '../../database/entities/booking.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { TripComment } from '../../database/entities/trip-comment.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { SearchTripsDto } from './dto/search-trips.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { BlocksService } from '../blocks/blocks.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { KashierService } from '../payments/kashier.service';
import { toPublicUser } from '../../common/serializers/public-user';
import {
  addDays,
  cairoDateString,
  cairoDayBounds,
  formatCairoDate,
  sameCairoTimeOn,
} from '../../common/time/cairo';
import { creditPassengerCompletion, REFERRAL_REWARD_EGP, restorePromoCredit } from '../bookings/booking-side-effects';
import { applyDriverCancellationStrike, LATE_DRIVER_CANCEL_HOURS } from './driver-strikes';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CreateTripSeriesDto } from './dto/create-trip.dto';
import { randomUUID } from 'crypto';
import { DriverBalanceService } from '../earnings/driver-balance.service';
import { Exclusive } from '../../common/jobs/exclusive';

// Matches the app's date picker. See assertDepartureTimeInRange — this needs to drop
// inside Kashier's authorization hold window before online payments can be relied on.
const MAX_TRIP_LEAD_DAYS = 90;

/** How long before departure a driver may start the trip (and live tracking). */
export const TRIP_START_WINDOW_MINUTES = 60;

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(TripComment)
    private readonly commentRepo: Repository<TripComment>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly blocksService: BlocksService,
    private readonly kashier: KashierService,
    private readonly balances: DriverBalanceService,
  ) {}

  /** Everything that must hold before a driver may post any trip. */
  private async assertCanPost(driver: User): Promise<void> {
    // driverVerified alone is not enough: resubmitting the ID clears idVerified but
    // leaves the driver approval in place until an admin looks again.
    if (!driver.driverVerified || !driver.idVerified) {
      throw new ForbiddenException('أكمل توثيق هويتك وبيانات السائق وانتظر موافقة الإدارة قبل نشر الرحلات');
    }

    if (driver.status === UserStatus.SUSPENDED || driver.status === UserStatus.BANNED) {
      throw new ForbiddenException('حسابك موقوف. يرجى التواصل مع الدعم.');
    }

    if (driver.tripPostingBannedUntil && driver.tripPostingBannedUntil > new Date()) {
      const until = formatCairoDate(driver.tripPostingBannedUntil);
      throw new ForbiddenException(`تم تعليق حقك في نشر الرحلات حتى ${until} بسبب الإلغاء المتكرر`);
    }

    // A driver running only cash trips never passes money through the platform, so the
    // commission they owe can only grow. Past the limit they settle before posting more.
    const balance = await this.balances.getBalance(driver.id);
    if (balance.cashCommissionOutstanding > balance.cashCommissionLimit) {
      throw new ForbiddenException(
        `عليك عمولة مستحقة ${balance.cashCommissionOutstanding} جنيه على رحلات الكاش. ` +
          'سددها من شاشة الأرباح لتتمكن من نشر رحلات جديدة.',
      );
    }

    const canPost = await this.subscriptionsService.canUserPostTrip(driver.id);
    if (!canPost) {
      throw new ForbiddenException('يجب الاشتراك في النسخة المدفوعة لنشر الرحلات');
    }
  }

  private assertRoute(dto: CreateTripDto): string[] | null {
    const norm = (c: string) => c.trim().toLowerCase();
    if (norm(dto.originCity) === norm(dto.destinationCity)) {
      throw new BadRequestException('مدينة الانطلاق والوصول يجب أن تكونا مختلفتين');
    }
    const stops = (dto.stops ?? []).map((c) => c.trim()).filter(Boolean);
    if (stops.some((c) => norm(c) === norm(dto.originCity) || norm(c) === norm(dto.destinationCity))) {
      throw new BadRequestException('محطات التوقف يجب أن تختلف عن مدينتي الانطلاق والوصول');
    }
    return stops.length ? stops : null;
  }

  private buildTrip(driver: User, dto: CreateTripDto, departure: Date, stops: string[] | null, seriesId: string | null) {
    const { stops: _stops, ...rest } = dto as CreateTripDto & { repeat?: unknown };
    delete (rest as { repeat?: unknown }).repeat;
    return this.tripRepo.create({
      ...rest,
      stops,
      seriesId,
      driverId: driver.id,
      availableSeats: dto.totalSeats,
      departureTime: departure,
      requireVerifiedPassengers: dto.requireVerifiedPassengers ?? true,
      womenOnly: dto.womenOnly ?? false,
      smokingAllowed: dto.smokingAllowed ?? false,
      petsAllowed: dto.petsAllowed ?? false,
      airConditioning: dto.airConditioning ?? false,
      luggageSize: dto.luggageSize ?? 'medium',
      chatPreference: dto.chatPreference ?? 'friendly',
    });
  }

  async create(driver: User, dto: CreateTripDto): Promise<Trip> {
    await this.assertCanPost(driver);
    this.assertDepartureTimeInRange(dto.departureTime);
    const stops = this.assertRoute(dto);
    return this.tripRepo.save(this.buildTrip(driver, dto, new Date(dto.departureTime), stops, null));
  }

  /**
   * A weekly series: the same route and time on the chosen weekdays for N weeks, starting
   * from the first departure. Drivers commuting the same route no longer re-enter it every
   * week. Occurrences past the booking horizon are skipped rather than failing the batch.
   */
  async createSeries(driver: User, dto: CreateTripSeriesDto) {
    await this.assertCanPost(driver);
    this.assertDepartureTimeInRange(dto.departureTime);
    const stops = this.assertRoute(dto);

    const first = new Date(dto.departureTime);
    const firstDay = cairoDateString(first);
    const firstWeekday = new Date(firstDay + 'T12:00:00Z').getUTCDay();
    const horizon = Date.now() + MAX_TRIP_LEAD_DAYS * 24 * 3_600_000;

    const departures: Date[] = [];
    for (let week = 0; week < dto.repeat.weeks; week++) {
      for (const weekday of [...dto.repeat.weekdays].sort()) {
        const offset = ((weekday - firstWeekday + 7) % 7) + week * 7;
        const at = sameCairoTimeOn(first, addDays(firstDay, offset));
        if (at.getTime() > Date.now() && at.getTime() <= horizon) departures.push(at);
      }
    }
    if (departures.length === 0) {
      throw new BadRequestException('لا توجد مواعيد صالحة في هذه السلسلة');
    }

    const seriesId = randomUUID();
    const trips = await this.tripRepo.save(
      departures.map((d) => this.buildTrip(driver, dto, d, stops, seriesId)),
    );
    return { seriesId, count: trips.length, trips };
  }

  /** Cancels every upcoming trip of a series (each with the normal refunds and rules). */
  async cancelSeries(seriesId: string, driver: User, reason?: string) {
    const trips = await this.tripRepo.find({
      where: { seriesId, driverId: driver.id, status: TripStatus.SCHEDULED },
      order: { departureTime: 'ASC' },
    });
    if (trips.length === 0) throw new NotFoundException('لا توجد رحلات قادمة في هذه السلسلة');
    let cancelled = 0;
    for (const trip of trips) {
      await this.cancel(trip.id, driver, reason);
      cancelled++;
    }
    return { cancelled };
  }

  // The app's date picker caps departure at 90 days, but that is client-side only —
  // a direct API call could post a trip years out, or in the past (which the scheduler
  // would then auto-cancel and strike the driver for).
  //
  // MAX_TRIP_LEAD_DAYS must end up inside Kashier's authorization hold window (7 or 30
  // days, per account configuration): a hold is placed when the passenger books, and
  // capture only happens at trip completion, so a longer lead time lets the hold lapse
  // before the money is taken. Lower this once Kashier confirms the window.
  private assertDepartureTimeInRange(value: Date | string): void {
    const departure = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(departure.getTime())) {
      throw new BadRequestException('تاريخ المغادرة غير صالح');
    }
    if (departure.getTime() <= Date.now()) {
      throw new BadRequestException('لا يمكن نشر رحلة في الماضي');
    }
    const maxLeadMs = MAX_TRIP_LEAD_DAYS * 24 * 60 * 60 * 1000;
    if (departure.getTime() - Date.now() > maxLeadMs) {
      throw new BadRequestException(
        `لا يمكن نشر رحلة بعد أكثر من ${MAX_TRIP_LEAD_DAYS} يوم من الآن`,
      );
    }
  }

  async search(dto: SearchTripsDto, currentUser: User) {
    // The day the passenger picked, in Cairo — not in the server's timezone
    const { start: startOfDay, end: endOfDay } = cairoDayBounds(dto.departureDate);
    // Today's trips that have already left are still SCHEDULED until the driver starts
    // them or the scheduler cancels them, and must not be offered for booking
    const now = new Date();
    const from = startOfDay > now ? startOfDay : now;

    // Block filtering: exclude trips from drivers I blocked, and drivers who blocked me
    const [blockedByMe, usersWhoBlockedMe] = await Promise.all([
      this.blocksService.getBlockedIds(currentUser.id),
      this.blocksService.getBlockerIds(currentUser.id),
    ]);
    const excludedDriverIds = [...new Set([...blockedByMe, ...usersWhoBlockedMe])];

    const qb = this.tripRepo
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.driver', 'driver')
      // The passenger's two cities must both be on the route — origin, a stop or the
      // destination — and in driving order.
      .where(
        `EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
                 jsonb_build_array(trip.origin_city) || COALESCE(trip.stops, '[]'::jsonb) || jsonb_build_array(trip.destination_city)
               ) WITH ORDINALITY AS a(city, i),
               jsonb_array_elements_text(
                 jsonb_build_array(trip.origin_city) || COALESCE(trip.stops, '[]'::jsonb) || jsonb_build_array(trip.destination_city)
               ) WITH ORDINALITY AS b(city, j)
          WHERE LOWER(a.city) = LOWER(:origin) AND LOWER(b.city) = LOWER(:destination) AND a.i < b.j
        )`,
        { origin: dto.originCity.trim(), destination: dto.destinationCity.trim() },
      )
      .andWhere('trip.departureTime >= :start AND trip.departureTime < :end', { start: from, end: endOfDay })
      .andWhere('trip.status = :status', { status: TripStatus.SCHEDULED })
      .andWhere('trip.availableSeats >= :seats', { seats: dto.seats ?? 1 });

    if (excludedDriverIds.length > 0) {
      qb.andWhere('trip.driverId NOT IN (:...excludedDriverIds)', { excludedDriverIds });
    }

    if (dto.womenOnly) {
      qb.andWhere('trip.womenOnly = true');
      qb.andWhere('driver.gender = :gender', { gender: 'female' });
    }

    if (dto.smokingAllowed !== undefined) {
      qb.andWhere('trip.smokingAllowed = :smoking', { smoking: dto.smokingAllowed });
    }

    if (dto.petsAllowed !== undefined) {
      qb.andWhere('trip.petsAllowed = :pets', { pets: dto.petsAllowed });
    }

    if (dto.maxPrice) {
      qb.andWhere('trip.pricePerSeat <= :maxPrice', { maxPrice: dto.maxPrice });
    }

    qb.orderBy('trip.departureTime', 'ASC');

    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 50);
    qb.skip((page - 1) * limit).take(limit);

    const [trips, total] = await qb.getManyAndCount();

    return {
      data: trips.map((t) => this.formatTrip(t)),
      total,
      page,
      limit,
    };
  }

  /** Full entity, including the driver's private columns. Internal callers only. */
  async findById(id: string): Promise<Trip> {
    const trip = await this.tripRepo.findOne({
      where: { id },
      relations: { driver: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  /**
   * What the trip-detail endpoint returns. Returning the raw entity handed every
   * viewer the driver's national ID number and photo, emergency contacts and FCM
   * token — formatTrip narrows it to the same public fields search already uses.
   */
  async findByIdPublic(id: string) {
    return this.formatTrip(await this.findById(id));
  }

  async cancel(tripId: string, driver: User, reason?: string): Promise<Trip> {
    const paymentsToRefund: string[] = [];

    const saved = await this.dataSource.transaction(async (manager) => {
      const trip = await manager.findOne(Trip, { where: { id: tripId } });
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.driverId !== driver.id) {
        throw new ForbiddenException('You can only cancel your own trips');
      }
      if (trip.status !== TripStatus.SCHEDULED) {
        throw new BadRequestException('Only scheduled trips can be cancelled');
      }

      // Cancel & refund ALL active bookings — confirmed, pending approval, and pending payment
      const bookings = await manager.find(Booking, {
        where: [
          { tripId, status: BookingStatus.CONFIRMED },
          { tripId, status: BookingStatus.PENDING_DRIVER_APPROVAL },
          { tripId, status: BookingStatus.PENDING_PAYMENT },
        ],
        relations: { payment: true },
      });

      const passengerIds: string[] = [];
      for (const booking of bookings) {
        // Payment state is deliberately left alone here. Kashier has to be called to
        // actually return the money, and a network call inside this transaction would
        // hold locks — and could leave the DB claiming REFUNDED when nothing moved.
        // Collected now, settled after the transaction commits.
        if (booking.payment && !booking.payment.isCash) {
          paymentsToRefund.push(booking.payment.id);
        }
        booking.status = BookingStatus.REFUNDED;
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'تم إلغاء الرحلة من قِبل السائق';
        await manager.save(Booking, booking);
        await restorePromoCredit(manager, booking);
        passengerIds.push(booking.passengerId);
      }

      trip.status = TripStatus.CANCELLED;
      trip.cancelledAt = new Date();
      trip.cancellationReason = reason ?? '';
      const saved = await manager.save(Trip, trip);

      // Cancelling on passengers who were counting on the ride, close to departure, is
      // what the strike policy exists for — it used to apply only to auto-cancellations.
      const hadConfirmedPassengers = bookings.some((b) => b.confirmedAt != null);
      const hoursUntilDeparture = (trip.departureTime.getTime() - Date.now()) / 3_600_000;
      if (hadConfirmedPassengers) {
        await manager.increment(User, { id: trip.driverId }, 'cancelledTripsAsDriver', 1);
        if (hoursUntilDeparture < LATE_DRIVER_CANCEL_HOURS) {
          const { notice } = await applyDriverCancellationStrike(manager, trip.driverId);
          if (notice) {
            setImmediate(() => void this.notifications.sendToUser(trip.driverId, notice));
          }
        }
      }

      // Notify all affected passengers
      if (passengerIds.length > 0) {
        setImmediate(() => {
          void this.notifications.sendToUsers(passengerIds, {
            title: 'تم إلغاء الرحلة',
            body: `رحلة ${trip.originCity} → ${trip.destinationCity} تم إلغاؤها من قِبل السائق. سيتم استرداد مبلغك كاملاً.`,
            data: { tripId, screen: 'my_bookings' },
          });
        });
      }

      return saved;
    });

    await this.returnFundsForPayments(paymentsToRefund, `trip ${tripId} cancelled by driver`);

    return saved;
  }

  /**
   * Actually returns passengers' money for cancelled bookings: a hold that was only
   * authorized is voided, a captured payment is refunded in full. Runs after the
   * cancelling transaction has committed, so the seats are freed even if the gateway is
   * unreachable — a payment that fails here keeps its current status and is logged, so
   * it stays visible for a retry rather than being recorded as refunded regardless.
   */
  private async returnFundsForPayments(paymentIds: string[], context: string): Promise<void> {
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

  async startTrip(tripId: string, driver: User): Promise<Trip> {
    const trip = await this.findById(tripId);
    if (trip.driverId !== driver.id) throw new ForbiddenException('Not your trip');
    if (trip.status !== TripStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled trips can be started');
    }
    // Starting a trip turns on live tracking and moves every booking to in-progress, so
    // a trip days away must not be startable (or completable) yet.
    const opensAt = new Date(trip.departureTime).getTime() - TRIP_START_WINDOW_MINUTES * 60_000;
    if (Date.now() < opensAt) {
      throw new BadRequestException(
        `يمكن بدء الرحلة قبل موعدها بـ ${TRIP_START_WINDOW_MINUTES} دقيقة كحد أقصى`,
      );
    }

    const confirmedBookings = await this.bookingRepo.find({
      where: { tripId, status: BookingStatus.CONFIRMED },
    });

    trip.status = TripStatus.ACTIVE;
    await this.tripRepo.save(trip);

    if (confirmedBookings.length > 0) {
      await this.bookingRepo.update(
        confirmedBookings.map((b) => b.id),
        { status: BookingStatus.IN_PROGRESS },
      );

      const passengerIds = confirmedBookings.map((b) => b.passengerId);
      const route = `${trip.originCity} ← ${trip.destinationCity}`;
      setImmediate(() =>
        void this.notifications.sendToUsers(passengerIds, {
          title: '🚗 رحلتك بدأت!',
          body: `السائق بدأ رحلة ${route}. تتبع موقعه من التطبيق.`,
          data: { screen: 'trip_detail', tripId: trip.id },
        }),
      );
    }

    return trip;
  }

  async updateTrip(tripId: string, driver: User, dto: UpdateTripDto): Promise<Trip> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driver.id) throw new ForbiddenException('Not your trip');
    if (trip.status !== TripStatus.SCHEDULED) {
      throw new BadRequestException('Only scheduled trips can be edited');
    }
    const bookedSeats = trip.totalSeats - trip.availableSeats;
    if (dto.totalSeats !== undefined && dto.totalSeats < bookedSeats) {
      throw new BadRequestException('Cannot reduce seats below already-booked count');
    }
    // Turning a trip women-only after men have booked would leave them on a trip they
    // are no longer allowed on; the driver has to cancel those bookings first.
    if (dto.womenOnly === true && !trip.womenOnly && bookedSeats > 0) {
      throw new BadRequestException('لا يمكن تحويل الرحلة لرحلة نسائية بعد وجود حجوزات عليها');
    }
    const previousDeparture = trip.departureTime;
    const { departureTime, ...rest } = dto;
    Object.assign(trip, rest);
    if (departureTime !== undefined) {
      this.assertDepartureTimeInRange(departureTime);
      trip.departureTime = new Date(departureTime);
    }
    if (dto.totalSeats !== undefined) {
      trip.availableSeats = dto.totalSeats - bookedSeats;
    }
    const saved = await this.tripRepo.save(trip);

    // Passengers planned their day around the old time. Moving it silently meant they
    // only found out at the pickup point.
    if (departureTime !== undefined && previousDeparture.getTime() !== saved.departureTime.getTime()) {
      setImmediate(async () => {
        const affected = await this.bookingRepo.find({
          where: {
            tripId,
            status: In([BookingStatus.CONFIRMED, BookingStatus.PENDING_DRIVER_APPROVAL]),
          },
          select: { passengerId: true },
        });
        const ids = [...new Set(affected.map((b) => b.passengerId))];
        if (ids.length > 0) {
          void this.notifications.sendToUsers(ids, {
            title: 'تغيّر موعد رحلتك ⏰',
            body: `غيّر السائق موعد رحلة ${saved.originCity} → ${saved.destinationCity}. راجع التفاصيل، ويمكنك الإلغاء إن لم يناسبك الموعد الجديد.`,
            data: { tripId, screen: 'trip_detail' },
          });
        }
      });
    }

    return saved;
  }

  async markComplete(tripId: string, driver: User): Promise<Trip> {
    const trip = await this.findById(tripId);

    if (trip.driverId !== driver.id) {
      throw new ForbiddenException('You can only complete your own trips');
    }

    // Only a started trip can be completed. Completing straight from SCHEDULED let a
    // driver "finish" a trip before it ever ran — even days ahead of departure — and
    // capture every passenger's held fare on the spot. The app only offers this action
    // on a started trip anyway.
    if (trip.status !== TripStatus.ACTIVE) {
      throw new BadRequestException('ابدأ الرحلة أولاً قبل إنهائها');
    }

    const paymentsToCaptureIds: string[] = [];
    const completedPassengerIds: string[] = [];
    let rewardedReferrers: string[] = [];

    const saved = await this.dataSource.transaction(async (manager) => {
      // Conditional transition, so two simultaneous "end trip" taps cannot both run the
      // completion — which double-counted the driver's trips and raced the captures.
      const transition = await manager
        .createQueryBuilder()
        .update(Trip)
        .set({ status: TripStatus.COMPLETED, completedAt: new Date() })
        .where('id = :id AND status = :active', { id: tripId, active: TripStatus.ACTIVE })
        .execute();
      if (!transition.affected) {
        throw new BadRequestException('Trip cannot be marked as complete in its current state');
      }
      trip.status = TripStatus.COMPLETED;
      trip.completedAt = new Date();
      const result = trip;

      // Load active bookings (CONFIRMED or IN_PROGRESS) with payments before bulk update
      const confirmedBookings = await manager.find(Booking, {
        where: [
          { tripId, status: BookingStatus.CONFIRMED },
          { tripId, status: BookingStatus.IN_PROGRESS },
        ],
        relations: { payment: true },
      });
      completedPassengerIds.push(...confirmedBookings.map((b) => b.passengerId));

      // Collected only — the payment stays PENDING until Kashier confirms the capture.
      // Writing CAPTURED here made uncollected money withdrawable during the gateway
      // call, and a crash in that window left the claim permanent. Recording it after
      // the fact can only under-credit the driver, which reconciliation repairs.
      for (const booking of confirmedBookings) {
        if (
          booking.payment &&
          !booking.payment.isCash &&
          booking.payment.status === PaymentStatus.PENDING
        ) {
          paymentsToCaptureIds.push(booking.payment.id);
        }
      }

      await manager.update(
        Booking,
        [
          { tripId, status: BookingStatus.CONFIRMED },
          { tripId, status: BookingStatus.IN_PROGRESS },
        ],
        { status: BookingStatus.TRIP_COMPLETED, completedAt: new Date() },
      );

      await manager
        .createQueryBuilder()
        .update('users')
        .set({ completedTripsAsDriver: () => 'completed_trips_as_driver + 1' })
        .where('id = :driverId', { driverId: driver.id })
        .execute();

      rewardedReferrers = await creditPassengerCompletion(manager, completedPassengerIds);

      return result;
    });

    for (const referrerId of rewardedReferrers) {
      setImmediate(() => {
        void this.notifications.sendToUser(referrerId, {
          title: 'مكافأة الدعوة',
          body: `رفيقك أكمل أول رحلة — حصلت على ${REFERRAL_REWARD_EGP} جنيه في رصيدك!`,
          data: { screen: 'my_bookings' },
        });
      });
    }

    // After the transaction: capture at Kashier, then record it. A payment left PENDING
    // here is simply not yet collected — reconcileCapturedPayments repairs the case
    // where the capture succeeded but recording it did not.
    if (paymentsToCaptureIds.length > 0) {
      setImmediate(async () => {
        const payments = await this.paymentRepo.findBy({ id: In(paymentsToCaptureIds) });
        for (const payment of payments) {
          await this.captureAndRecord(payment);
        }
      });
    }

    // Notify all passengers that the trip is complete
    if (completedPassengerIds.length > 0) {
      setImmediate(() => {
        for (const passengerId of completedPassengerIds) {
          void this.notifications.sendToUser(passengerId, {
            title: 'اكتملت الرحلة ✅',
            body: 'تم إنهاء الرحلة بنجاح. يمكنك الآن تقييم التجربة.',
            data: { tripId, screen: 'trip_detail' },
          });
        }
      });
    }

    return saved;
  }

  /**
   * Captures a payment at Kashier and only then records it as CAPTURED. If the call
   * fails, Kashier is asked what actually happened — a capture that really did go
   * through is still recorded, anything else stays PENDING and is retried later.
   */
  private async captureAndRecord(payment: Payment): Promise<void> {
    if (payment.isCash || payment.status !== PaymentStatus.PENDING) return;
    const orderId = payment.gatewayTransactionId ?? payment.gatewayOrderId;
    if (!orderId) return;

    const markCaptured = (transactionId?: string | null) =>
      this.paymentRepo.update(payment.id, {
        status: PaymentStatus.CAPTURED,
        capturedAt: new Date(),
        // Kashier returns the capture's own TX id, which a later void or refund needs
        // as targetTransactionId. Nothing else we hold can substitute for it.
        ...(transactionId ? { kashierTransactionId: transactionId } : {}),
      });

    try {
      const { transactionId } = await this.kashier.capturePayment(
        orderId,
        Number(payment.amount),
      );
      await markCaptured(transactionId);
      this.logger.log(`Captured payment ${payment.id} (${payment.amount} EGP)`);
    } catch (e) {
      // Asked by merchantOrderId, which we always have — the session lookup depends on
      // a sessionId parsed from the checkout URL and is null on older payments.
      const actual =
        (await this.kashier.getOrderStatus(payment.gatewayOrderId)) ??
        (await this.kashier.getPaymentStatus(payment.gatewaySessionId));
      if (actual === 'CAPTURED') {
        await markCaptured();
        this.logger.warn(
          `Capture call failed for payment ${payment.id} but Kashier reports CAPTURED — recorded: ${String(e)}`,
        );
      } else {
        this.logger.error(
          `Kashier capture failed for payment ${payment.id} (Kashier status: ${actual ?? 'unknown'}): ${String(e)}`,
        );
      }
    }
  }

  /**
   * Trips finish but their payment can stay PENDING — the capture failed, or it
   * succeeded and the process died before recording it. Either way the driver is short
   * until this runs, so retry the capture and let Kashier settle which case it was.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  @Exclusive()
  async reconcileCapturedPayments(): Promise<void> {
    if (this.kashier.isMock) return;

    const stuck = await this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin(Booking, 'b', 'b.id = p.booking_id')
      .where('p.status = :pending', { pending: PaymentStatus.PENDING })
      .andWhere('p.is_cash = false')
      .andWhere('b.status = :completed', { completed: BookingStatus.TRIP_COMPLETED })
      .getMany();

    for (const payment of stuck) {
      await this.captureAndRecord(payment);
    }
  }

  async getDriverTrips(driverId: string, status?: TripStatus): Promise<Trip[]> {
    const where: FindOptionsWhere<Trip> = { driverId };
    if (status) where.status = status;
    return this.tripRepo.find({ where, order: { departureTime: 'DESC' } });
  }

  async getBookingsForTrip(tripId: string, driver: User): Promise<(Booking & { hasRated: boolean })[]> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driver.id) throw new ForbiddenException('Not your trip');

    const bookings = await this.bookingRepo.find({
      where: { tripId },
      relations: { passenger: true },
      order: { createdAt: 'ASC' },
    });
    if (bookings.length === 0) return [];

    const bookingIds = bookings.map((b) => b.id);
    const ratedRows = await this.dataSource.query<Array<{ booking_id: string }>>(
      `SELECT booking_id FROM ratings WHERE rater_id = $1 AND booking_id = ANY($2)`,
      [driver.id, bookingIds],
    );
    const ratedSet = new Set(ratedRows.map((r) => r.booking_id));
    // The driver sees who is riding with them, not the passengers' private records
    return bookings.map((b) => ({
      ...b,
      passenger: toPublicUser(b.passenger),
      hasRated: ratedSet.has(b.id),
    })) as unknown as (Booking & { hasRated: boolean })[];
  }

  // Public endpoint: it returned each commenter's full user record — phone number,
  // national ID and all — to anyone, signed in or not.
  async getComments(tripId: string) {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    const comments = await this.commentRepo.find({
      where: { tripId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return comments.map((c) => ({ ...c, user: toPublicUser(c.user) }));
  }

  async addComment(tripId: string, user: User, body: string) {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    const comment = this.commentRepo.create({ tripId, userId: user.id, body: body.trim() });
    const saved = await this.commentRepo.save(comment);

    const senderName = user.fullName || user.phoneNumber;
    const preview = body.length > 60 ? body.substring(0, 60) + '...' : body;
    if (trip.driverId !== user.id) {
      // Passenger posted — notify driver
      setImmediate(() => {
        void this.notifications.sendToUser(trip.driverId, {
          title: 'تعليق جديد على رحلتك',
          body: `${senderName}: ${preview}`,
          data: { tripId, screen: 'trip_detail' },
        });
      });
    } else {
      // Driver posted — notify all confirmed/in-progress passengers
      setImmediate(async () => {
        const passengerBookings = await this.bookingRepo.find({
          where: { tripId, status: In(PARTICIPANT_BOOKING_STATUSES) },
          select: { passengerId: true },
        });
        for (const b of passengerBookings) {
          void this.notifications.sendToUser(b.passengerId, {
            title: 'تعليق جديد على الرحلة',
            body: `السائق: ${preview}`,
            data: { tripId, screen: 'trip_detail' },
          });
        }
      });
    }

    return { ...saved, user: toPublicUser(user) };
  }

  async getCoPassengers(tripId: string, user: User) {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');

    const isDriver = trip.driverId === user.id;
    if (!isDriver) {
      const booking = await this.bookingRepo.findOne({
        where: { tripId, passengerId: user.id, status: In(PARTICIPANT_BOOKING_STATUSES) },
      });
      if (!booking) throw new ForbiddenException('Not a participant on this trip');
    }

    const bookings = await this.bookingRepo.find({
      where: { tripId, status: In(PARTICIPANT_BOOKING_STATUSES) },
      relations: { passenger: true },
      order: { createdAt: 'ASC' },
    });

    return bookings
      .filter((b) => b.passengerId !== user.id)
      .map((b) => {
        const p = b.passenger;
        const firstName = (p.fullName || '').split(' ')[0] || 'راكب';
        return {
          id:                        p.id,
          firstName,
          gender:                    p.gender ?? null,
          profilePhotoUrl:           p.profilePhotoUrl ?? null,
          ratingAverage:             p.ratingAverage,
          ratingCount:               p.ratingCount,
          completedTripsAsPassenger: p.completedTripsAsPassenger,
          seatsCount:                b.seatsCount,
        };
      });
  }

  private formatTrip(trip: Trip) {
    const { driver, ...rest } = trip;
    return {
      ...rest,
      driver: driver
        ? {
            id: driver.id,
            fullName: driver.fullName,
            profilePhotoUrl: driver.profilePhotoUrl,
            ratingAverage: driver.ratingAverage,
            ratingCount: driver.ratingCount,
            completedTripsAsDriver: driver.completedTripsAsDriver,
            idVerified: driver.idVerified,
            driverVerified: driver.driverVerified,
            vehicleMake: driver.vehicleMake,
            vehicleModel: driver.vehicleModel,
            vehicleYear: driver.vehicleYear,
            vehicleColor: driver.vehicleColor,
          }
        : null,
    };
  }
}
