/**
 * Regression tests for the access-control, privacy and integrity fixes from the
 * October 2026 audit. Runs against the same database as features.e2e-spec.ts and uses
 * its own phone-number range (+2011111002xx) so the two suites never share rows.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, In, Like, Repository } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus, Gender } from '../src/database/entities/user.entity';
import { Trip, TripStatus } from '../src/database/entities/trip.entity';
import { Booking, BookingStatus, PaymentMethod } from '../src/database/entities/booking.entity';
import { Payment, PaymentStatus } from '../src/database/entities/payment.entity';
import { TripComment } from '../src/database/entities/trip-comment.entity';
import { Otp } from '../src/database/entities/otp.entity';
import { BookingsService, PENDING_PAYMENT_TTL_MINUTES } from '../src/modules/bookings/bookings.service';
import { TripsService } from '../src/modules/trips/trips.service';
import { KashierService } from '../src/modules/payments/kashier.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { LocationService, LOCATION_RETENTION_DAYS } from '../src/modules/location/location.service';
import { TripLocation } from '../src/database/entities/trip-location.entity';
import { cairoDayBounds, formatCairoTime } from '../src/common/time/cairo';
import { parseEgyptianNationalId } from '../src/common/validation/egyptian-national-id';

const PREFIX = '+2011111002';

describe('Security & integrity regressions', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;
  let userRepo: Repository<User>;
  let tripRepo: Repository<Trip>;
  let bookingRepo: Repository<Booking>;
  let paymentRepo: Repository<Payment>;
  let commentRepo: Repository<TripComment>;
  let otpRepo: Repository<Otp>;
  let bookingsService: BookingsService;
  let tripsService: TripsService;
  let kashier: KashierService;
  let adminService: AdminService;
  let locationService: LocationService;

  let driver: User;
  let passenger: User;
  let stranger: User;
  let admin: User;

  const token = (u: User) => `Bearer ${jwt.sign({ sub: u.id, phone: u.phoneNumber })}`;

  async function cleanup() {
    const users = await userRepo.find({ where: { phoneNumber: Like(`${PREFIX}%`) } });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      const trips = await tripRepo.find({ where: { driverId: In(ids) } });
      const tripIds = trips.map((t) => t.id);
      if (tripIds.length) {
        const bookings = await bookingRepo.find({ where: { tripId: In(tripIds) } });
        if (bookings.length) {
          await paymentRepo.delete({ bookingId: In(bookings.map((b) => b.id)) });
          await bookingRepo.delete({ id: In(bookings.map((b) => b.id)) });
        }
        await commentRepo.delete({ tripId: In(tripIds) });
        await tripRepo.delete({ id: In(tripIds) });
      }
      await dataSource.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await dataSource.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1)', [ids]);
      await userRepo.delete({ id: In(ids) });
    }
    await otpRepo.delete({ phoneNumber: Like(`${PREFIX}%`) });
  }

  async function makeUser(suffix: string, extra: Partial<User> = {}) {
    return userRepo.save(
      userRepo.create({
        phoneNumber: `${PREFIX}${suffix}`,
        fullName: `Sec ${suffix}`,
        status: UserStatus.ACTIVE,
        nationalIdNumber: `2990101010${suffix.padStart(4, '0')}`.slice(0, 14),
        fcmToken: `fcm-secret-${suffix}`,
        emergencyContactPhone: '+201000000000',
        ...extra,
      }),
    );
  }

  async function makeTrip(overrides: Partial<Trip> = {}) {
    return tripRepo.save(
      tripRepo.create({
        driverId: driver.id,
        originCity: 'القاهرة',
        destinationCity: 'الإسكندرية',
        departureTime: new Date(Date.now() + 3 * 24 * 3_600_000),
        totalSeats: 4,
        availableSeats: 4,
        pricePerSeat: 150,
        status: TripStatus.SCHEDULED,
        ...overrides,
      }),
    );
  }

  async function makeBooking(tripId: string, overrides: Partial<Booking> = {}, paymentOverrides: Partial<Payment> = {}) {
    const booking = await bookingRepo.save(
      bookingRepo.create({
        tripId,
        passengerId: passenger.id,
        seatsCount: 1,
        totalAmount: 150,
        commissionAmount: 15,
        driverPayoutAmount: 135,
        commissionRate: 0.1,
        paymentMethod: PaymentMethod.CASH,
        status: BookingStatus.CONFIRMED,
        ...overrides,
      }),
    );
    const payment = await paymentRepo.save(
      paymentRepo.create({
        bookingId: booking.id,
        amount: Number(booking.totalAmount),
        status: PaymentStatus.CAPTURED,
        isCash: booking.paymentMethod === PaymentMethod.CASH,
        gatewayOrderId: booking.id,
        ...paymentOverrides,
      }),
    );
    return { booking, payment };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    jwt = moduleFixture.get(JwtService);
    userRepo = moduleFixture.get(getRepositoryToken(User));
    tripRepo = moduleFixture.get(getRepositoryToken(Trip));
    bookingRepo = moduleFixture.get(getRepositoryToken(Booking));
    paymentRepo = moduleFixture.get(getRepositoryToken(Payment));
    commentRepo = moduleFixture.get(getRepositoryToken(TripComment));
    otpRepo = moduleFixture.get(getRepositoryToken(Otp));
    bookingsService = moduleFixture.get(BookingsService);
    tripsService = moduleFixture.get(TripsService);
    kashier = moduleFixture.get(KashierService);
    adminService = moduleFixture.get(AdminService);
    locationService = moduleFixture.get(LocationService);

    await cleanup();
    driver = await makeUser('01', { role: UserRole.BOTH, driverVerified: true, gender: Gender.MALE });
    passenger = await makeUser('02', { gender: Gender.FEMALE });
    stranger = await makeUser('03', { gender: Gender.MALE });
    admin = await makeUser('04', { role: UserRole.ADMIN });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(() => jest.restoreAllMocks());

  // ── Access control ─────────────────────────────────────────────────────────

  describe('GET /bookings/:id', () => {
    it('is not readable by someone who is neither passenger, driver nor admin', async () => {
      const trip = await makeTrip();
      const { booking } = await makeBooking(trip.id);
      await request(app.getHttpServer())
        .get(`/api/v1/bookings/${booking.id}`)
        .set('Authorization', token(stranger))
        .expect(404);
    });

    it('returns only public profiles of the other party to the passenger', async () => {
      const trip = await makeTrip();
      const { booking } = await makeBooking(trip.id);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/bookings/${booking.id}`)
        .set('Authorization', token(passenger))
        .expect(200);
      expect(res.body.trip.driver.id).toBe(driver.id);
      expect(res.body.trip.driver).not.toHaveProperty('phoneNumber');
      expect(res.body.trip.driver).not.toHaveProperty('nationalIdNumber');
      expect(res.body.trip.driver).not.toHaveProperty('fcmToken');
      expect(res.body.trip.driver).toHaveProperty('vehiclePlate');
      expect(res.body.payment).not.toHaveProperty('gatewayResponse');
    });
  });

  describe('SOS admin endpoints', () => {
    it('refuses non-admins', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/trips/sos/pending')
        .set('Authorization', token(passenger))
        .expect(403);
    });

    it('allows admins', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/trips/sos/pending')
        .set('Authorization', token(admin))
        .expect(200);
    });
  });

  it('a banned user is rejected on every request, not just at login', async () => {
    const banned = await makeUser('05', { status: UserStatus.BANNED });
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', token(banned))
      .expect(401);
  });

  // ── Privacy ────────────────────────────────────────────────────────────────

  it('public trip comments expose no private commenter fields', async () => {
    const trip = await makeTrip();
    await tripsService.addComment(trip.id, passenger, 'هل يوجد مكان للشنط؟');
    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${trip.id}/comments`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].user.fullName).toBe(passenger.fullName);
    expect(res.body[0].user).not.toHaveProperty('phoneNumber');
    expect(res.body[0].user).not.toHaveProperty('nationalIdNumber');
    expect(res.body[0].user).not.toHaveProperty('emergencyContactPhone');
  });

  it("the driver's passenger list carries public profiles only", async () => {
    const trip = await makeTrip();
    await makeBooking(trip.id);
    const rows = await tripsService.getBookingsForTrip(trip.id, driver);
    expect(rows[0].passenger).not.toHaveProperty('phoneNumber');
    expect(rows[0].passenger).not.toHaveProperty('nationalIdNumber');
  });

  // ── Trip lifecycle ─────────────────────────────────────────────────────────

  it('a trip cannot be completed before it has been started', async () => {
    const trip = await makeTrip();
    await expect(tripsService.markComplete(trip.id, driver)).rejects.toThrow();
    expect((await tripRepo.findOneBy({ id: trip.id }))?.status).toBe(TripStatus.SCHEDULED);
  });

  it('completing a trip counts the passenger trip', async () => {
    const trip = await makeTrip({ status: TripStatus.ACTIVE });
    await makeBooking(trip.id, { status: BookingStatus.IN_PROGRESS });
    const before = (await userRepo.findOneBy({ id: passenger.id }))!.completedTripsAsPassenger;
    await tripsService.markComplete(trip.id, driver);
    const after = (await userRepo.findOneBy({ id: passenger.id }))!.completedTripsAsPassenger;
    expect(after).toBe(before + 1);
    await expect(tripsService.markComplete(trip.id, driver)).rejects.toThrow();
  });

  it('a late manual cancellation with confirmed passengers gives the driver a strike', async () => {
    await userRepo.update(driver.id, { cancellationStrikes: 0 });
    const trip = await makeTrip({ departureTime: new Date(Date.now() + 3 * 3_600_000) });
    await makeBooking(trip.id, { confirmedAt: new Date() });
    await tripsService.cancel(trip.id, driver, 'ظرف طارئ');
    expect((await userRepo.findOneBy({ id: driver.id }))!.cancellationStrikes).toBe(1);
    await userRepo.update(driver.id, { cancellationStrikes: 0, tripPostingBannedUntil: null });
  });

  // ── Booking creation ───────────────────────────────────────────────────────

  describe('BookingsService.create', () => {
    it('refuses a trip whose departure has already passed', async () => {
      const trip = await makeTrip();
      await tripRepo.update(trip.id, { departureTime: new Date(Date.now() - 10 * 60_000) });
      await expect(
        bookingsService.create(passenger, { tripId: trip.id, seatsCount: 1 }),
      ).rejects.toThrow();
    });

    it('refuses a second active booking on the same trip', async () => {
      const trip = await makeTrip();
      await bookingsService.create(passenger, { tripId: trip.id, seatsCount: 1 });
      await expect(
        bookingsService.create(passenger, { tripId: trip.id, seatsCount: 1 }),
      ).rejects.toThrow('حجز قائم');
    });

    it('refuses a passenger the driver has blocked', async () => {
      const trip = await makeTrip();
      await dataSource.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [driver.id, stranger.id]);
      try {
        await expect(
          bookingsService.create(stranger, { tripId: trip.id, seatsCount: 1 }),
        ).rejects.toThrow();
      } finally {
        await dataSource.query('DELETE FROM blocks WHERE blocker_id = $1', [driver.id]);
      }
    });

    it('a cash-booking restriction does not block card bookings', async () => {
      const trip = await makeTrip();
      await userRepo.update(stranger.id, { cashBookingRestrictedUntil: new Date(Date.now() + 86_400_000) });
      jest.spyOn(kashier, 'createPaymentSession').mockResolvedValue({
        sessionUrl: 'https://example.test/session/abc', orderId: 'x', sessionId: 'abc',
      });
      try {
        await expect(
          bookingsService.create(stranger, { tripId: trip.id, seatsCount: 1 }),
        ).rejects.toThrow('الكاش');
        const card = await bookingsService.create(stranger, {
          tripId: trip.id, seatsCount: 1, paymentMethod: PaymentMethod.CARD,
        });
        expect(card.status).toBe(BookingStatus.PENDING_PAYMENT);
      } finally {
        await userRepo.update(stranger.id, { cashBookingRestrictedUntil: null });
      }
    });
  });

  describe('promo credit and abandoned payments', () => {
    it('driver rejection returns the promo credit', async () => {
      const trip = await makeTrip();
      await userRepo.update(passenger.id, { promoBalance: 20 });
      const booking = await bookingsService.create(passenger, { tripId: trip.id, seatsCount: 1, usePromo: true });
      expect(Number((await userRepo.findOneBy({ id: passenger.id }))!.promoBalance)).toBe(0);
      await bookingsService.rejectBooking(booking.id, driver);
      expect(Number((await userRepo.findOneBy({ id: passenger.id }))!.promoBalance)).toBe(20);
      await userRepo.update(passenger.id, { promoBalance: 0 });
    });

    it('an unpaid card booking past its window releases its seats', async () => {
      const trip = await makeTrip({ availableSeats: 3 });
      const { booking } = await makeBooking(
        trip.id,
        { status: BookingStatus.PENDING_PAYMENT, paymentMethod: PaymentMethod.CARD },
        { status: PaymentStatus.PENDING, isCash: false },
      );
      await bookingRepo.update(booking.id, {
        createdAt: new Date(Date.now() - (PENDING_PAYMENT_TTL_MINUTES + 5) * 60_000),
      });
      jest.spyOn(kashier, 'getPaymentStatus').mockResolvedValue(null);
      jest.spyOn(kashier, 'getOrderStatus').mockResolvedValue(null);

      await bookingsService.expireAbandonedPayments();

      expect((await bookingRepo.findOneBy({ id: booking.id }))?.status).toBe(BookingStatus.CANCELLED_BY_PASSENGER);
      expect((await tripRepo.findOneBy({ id: trip.id }))?.availableSeats).toBe(4);
    });

    it('a stale pending booking that Kashier reports paid is moved on, not expired', async () => {
      const trip = await makeTrip({ availableSeats: 3 });
      const { booking } = await makeBooking(
        trip.id,
        { status: BookingStatus.PENDING_PAYMENT, paymentMethod: PaymentMethod.CARD },
        { status: PaymentStatus.PENDING, isCash: false, gatewaySessionId: 'sess-1' },
      );
      await bookingRepo.update(booking.id, {
        createdAt: new Date(Date.now() - (PENDING_PAYMENT_TTL_MINUTES + 5) * 60_000),
      });
      jest.spyOn(kashier, 'getPaymentStatus').mockResolvedValue('AUTHORIZED');

      await bookingsService.expireAbandonedPayments();

      expect((await bookingRepo.findOneBy({ id: booking.id }))?.status).toBe(BookingStatus.PENDING_DRIVER_APPROVAL);
    });
  });

  it('the payment redirect never stores an order id for an unpaid booking', async () => {
    const trip = await makeTrip();
    const { booking, payment } = await makeBooking(
      trip.id,
      { status: BookingStatus.PENDING_PAYMENT, paymentMethod: PaymentMethod.CARD },
      { status: PaymentStatus.PENDING, isCash: false, gatewaySessionId: 'sess-2' },
    );
    jest.spyOn(kashier, 'getPaymentStatus').mockResolvedValue('PENDING');
    const result = await bookingsService.healFromRedirect(booking.id, 'someone-elses-order', passenger);
    expect(result.healed).toBe(false);
    expect((await paymentRepo.findOneBy({ id: payment.id }))?.gatewayTransactionId).toBeNull();
  });

  // ── Profile & verification ─────────────────────────────────────────────────

  describe('profile and ID verification', () => {
    it('gender cannot be switched once set', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', token(stranger))
        .send({ gender: 'female' })
        .expect(400);
    });

    it('rejects a national ID that does not match the profile gender', async () => {
      // 13th digit 2 → female, but this user is male
      await request(app.getHttpServer())
        .post('/api/v1/users/me/id-verification')
        .set('Authorization', token(stranger))
        .send({ nationalIdNumber: '29901010100021' })
        .expect(400);
    });

    it('a resubmitted ID goes back to unverified', async () => {
      await userRepo.update(passenger.id, { idVerified: true });
      await request(app.getHttpServer())
        .post('/api/v1/users/me/id-verification')
        .set('Authorization', token(passenger))
        .send({ nationalIdNumber: '29901010100042' })
        .expect(201);
      expect((await userRepo.findOneBy({ id: passenger.id }))?.idVerified).toBe(false);
    });
  });

  describe('OTP', () => {
    it('refuses a second code inside the resend cooldown', async () => {
      const phone = `${PREFIX}90`;
      await request(app.getHttpServer()).post('/api/v1/auth/otp/send').send({ phoneNumber: phone }).expect(200);
      await request(app.getHttpServer()).post('/api/v1/auth/otp/send').send({ phoneNumber: phone }).expect(429);
    });
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  it('admin search by name or phone works (it used to crash on non-uuid input)', async () => {
    const result = await adminService.search('Sec 0');
    expect(result.users.length).toBeGreaterThan(0);
  });

  it('admin analytics returns top routes', async () => {
    const analytics = await adminService.getAnalytics();
    expect(Array.isArray(analytics.topRoutes)).toBe(true);
  });

  describe('location trail', () => {
    it('recording a position updates the trip, and old trails of finished trips are purged', async () => {
      const trip = await makeTrip({ status: TripStatus.ACTIVE });
      await locationService.recordLocation(trip.id, driver.id, { latitude: 30.05, longitude: 31.24 });
      const tracked = await tripRepo.findOneByOrFail({ id: trip.id });
      expect(Number(tracked.currentLat)).toBeCloseTo(30.05);

      const locRepo = dataSource.getRepository(TripLocation);
      const old = new Date(Date.now() - (LOCATION_RETENTION_DAYS + 1) * 24 * 3_600_000);
      await locRepo.query('UPDATE trip_locations SET recorded_at = $1 WHERE trip_id = $2', [old, trip.id]);

      // Still active → kept
      await locationService.purgeOldLocations();
      expect(await locRepo.countBy({ tripId: trip.id })).toBe(1);

      await tripRepo.update(trip.id, { status: TripStatus.COMPLETED });
      await locationService.purgeOldLocations();
      expect(await locRepo.countBy({ tripId: trip.id })).toBe(0);
    });
  });

  // ── Pure helpers ───────────────────────────────────────────────────────────

  describe('Cairo time helpers', () => {
    it('summer day starts at 21:00 UTC the previous day (UTC+3)', () => {
      const { start, end } = cairoDayBounds('2026-07-15');
      expect(start.toISOString()).toBe('2026-07-14T21:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-15T21:00:00.000Z');
    });

    it('winter day starts at 22:00 UTC the previous day (UTC+2)', () => {
      const { start } = cairoDayBounds('2026-01-15');
      expect(start.toISOString()).toBe('2026-01-14T22:00:00.000Z');
    });

    it('formats times in Cairo', () => {
      expect(formatCairoTime(new Date('2026-01-15T08:30:00Z'))).toBe('10:30');
    });
  });

  describe('Egyptian national ID', () => {
    it('extracts gender and birth date', () => {
      const parsed = parseEgyptianNationalId('29901010100031');
      expect(parsed?.gender).toBe(Gender.MALE);
      expect(parsed?.birthDate.toISOString().slice(0, 10)).toBe('1999-01-01');
    });

    it('rejects impossible dates and unknown governorates', () => {
      expect(parseEgyptianNationalId('29913320100031')).toBeNull();
      expect(parseEgyptianNationalId('29901019900031')).toBeNull();
      expect(parseEgyptianNationalId('12345')).toBeNull();
    });
  });
});
