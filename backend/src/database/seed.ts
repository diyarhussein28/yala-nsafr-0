/**
 * Demo data for local development and UI work: an admin, verified drivers, passengers,
 * upcoming trips on the main intercity routes, and a little history (completed trips,
 * ratings, a dispute) so every screen has something to show.
 *
 *   npm run seed            # adds the demo data (idempotent: re-running replaces it)
 *
 * All seeded phone numbers start with +2010000000, and only those rows are touched.
 * Refuses to run when NODE_ENV=production.
 */
import 'reflect-metadata';
import { Like } from 'typeorm';
import dataSource from './data-source';
import { User, UserRole, UserStatus, Gender } from './entities/user.entity';
import { Trip, TripStatus } from './entities/trip.entity';
import { Booking, BookingStatus, PaymentMethod } from './entities/booking.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Rating, RaterRole } from './entities/rating.entity';

const PREFIX = '+2010000000';
const HOUR = 3_600_000;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }
  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const trips = dataSource.getRepository(Trip);
  const bookings = dataSource.getRepository(Booking);
  const payments = dataSource.getRepository(Payment);
  const ratings = dataSource.getRepository(Rating);

  // ── Remove the previous demo data ──────────────────────────────────────────
  const old = await users.find({ where: { phoneNumber: Like(`${PREFIX}%`) }, select: { id: true } });
  if (old.length) {
    const ids = old.map((u) => u.id);
    const q = (sql: string) => dataSource.query(sql, [ids]);
    await q('DELETE FROM ratings WHERE rater_id = ANY($1) OR ratee_id = ANY($1)');
    await q('DELETE FROM disputes WHERE opened_by_user_id = ANY($1)');
    await q('DELETE FROM payments WHERE booking_id IN (SELECT b.id FROM bookings b JOIN trips t ON t.id = b.trip_id WHERE t.driver_id = ANY($1) OR b.passenger_id = ANY($1))');
    await q('DELETE FROM bookings WHERE passenger_id = ANY($1) OR trip_id IN (SELECT id FROM trips WHERE driver_id = ANY($1))');
    await q('DELETE FROM trip_comments WHERE user_id = ANY($1)');
    await q('DELETE FROM trip_messages WHERE sender_id = ANY($1)');
    await q('DELETE FROM trips WHERE driver_id = ANY($1)');
    await q('DELETE FROM notifications WHERE user_id = ANY($1)');
    await q('DELETE FROM refresh_tokens WHERE user_id = ANY($1)');
    await q('DELETE FROM driver_ledger WHERE driver_id = ANY($1)');
    await q('DELETE FROM withdrawal_requests WHERE driver_id = ANY($1)');
    await q('DELETE FROM subscriptions WHERE user_id = ANY($1)');
    await q('DELETE FROM users WHERE id = ANY($1)');
  }

  // ── People ─────────────────────────────────────────────────────────────────
  const person = (n: number, data: Partial<User>) =>
    users.save(
      users.create({
        phoneNumber: `${PREFIX}${String(n).padStart(2, '0')}`,
        status: UserStatus.ACTIVE,
        referralCode: `DEMO${String(n).padStart(2, '0')}`,
        idVerified: true,
        idVerifiedAt: new Date(),
        emergencyContactName: 'أحمد',
        emergencyContactPhone: '+201000000099',
        ...data,
      }),
    );

  const admin = await person(1, { fullName: 'مدير المنصة', role: UserRole.ADMIN, gender: Gender.MALE });
  const drivers = await Promise.all([
    person(10, { fullName: 'محمد عبد الله', gender: Gender.MALE, role: UserRole.BOTH, driverVerified: true, vehicleMake: 'Hyundai', vehicleModel: 'Elantra', vehicleYear: 2021, vehicleColor: 'أبيض', vehiclePlate: 'ص ط ر 4821', ratingAverage: 4.8, ratingCount: 124, completedTripsAsDriver: 131 }),
    person(11, { fullName: 'سارة مصطفى', gender: Gender.FEMALE, role: UserRole.BOTH, driverVerified: true, vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehicleYear: 2022, vehicleColor: 'فضي', vehiclePlate: 'م ن ع 1937', ratingAverage: 4.9, ratingCount: 58, completedTripsAsDriver: 61 }),
    person(12, { fullName: 'كريم حسن', gender: Gender.MALE, role: UserRole.BOTH, driverVerified: true, vehicleMake: 'Kia', vehicleModel: 'Cerato', vehicleYear: 2020, vehicleColor: 'أسود', vehiclePlate: 'ب س د 7302', ratingAverage: 4.6, ratingCount: 37, completedTripsAsDriver: 40 }),
  ]);
  const passengers = await Promise.all([
    person(20, { fullName: 'نور الهدى أحمد', gender: Gender.FEMALE, completedTripsAsPassenger: 12, ratingAverage: 4.9, ratingCount: 11, promoBalance: 20 }),
    person(21, { fullName: 'يوسف إبراهيم', gender: Gender.MALE, completedTripsAsPassenger: 5, ratingAverage: 4.7, ratingCount: 5 }),
    person(22, { fullName: 'منة الله سمير', gender: Gender.FEMALE, completedTripsAsPassenger: 2, ratingAverage: 5, ratingCount: 2, idVerified: false, nationalIdNumber: '30105150100248' }),
  ]);
  // Waiting in the admin verification queue
  await person(30, { fullName: 'عمرو خالد', gender: Gender.MALE, role: UserRole.BOTH, idVerified: false, nationalIdNumber: '29808120100317', vehicleMake: 'Nissan', vehicleModel: 'Sunny', vehicleYear: 2019, vehicleColor: 'أحمر', vehiclePlate: 'ع ل م 5510' });

  // ── Upcoming trips ─────────────────────────────────────────────────────────
  const routes: Array<[string, string, string, string, number]> = [
    ['القاهرة', 'الإسكندرية', 'ميدان رمسيس', 'محطة مصر', 180],
    ['القاهرة', 'الإسكندرية', 'التجمع الخامس', 'سموحة', 200],
    ['الإسكندرية', 'القاهرة', 'سيدي جابر', 'مدينة نصر', 180],
    ['القاهرة', 'المنصورة', 'المعادي', 'المشاية', 120],
    ['القاهرة', 'الغردقة', 'مصر الجديدة', 'الدهار', 450],
    ['القاهرة', 'أسيوط', 'الجيزة', 'وسط البلد', 300],
    ['طنطا', 'القاهرة', 'الاستاد', 'شبرا', 90],
  ];
  const tomorrow8 = new Date();
  tomorrow8.setUTCDate(tomorrow8.getUTCDate() + 1);
  tomorrow8.setUTCHours(5, 0, 0, 0); // 08:00 Cairo

  const upcoming: Trip[] = [];
  for (let day = 0; day < 4; day++) {
    for (const [i, [from, to, fromAddr, toAddr, price]] of routes.entries()) {
      const driver = drivers[(i + day) % drivers.length];
      const departure = new Date(tomorrow8.getTime() + day * 24 * HOUR + ((i * 2) % 12) * HOUR);
      upcoming.push(
        await trips.save(
          trips.create({
            driverId: driver.id,
            originCity: from,
            destinationCity: to,
            originAddress: fromAddr,
            destinationAddress: toAddr,
            departureTime: departure,
            totalSeats: 4,
            availableSeats: 4 - ((i + day) % 3),
            pricePerSeat: price,
            womenOnly: driver.gender === Gender.FEMALE && i % 2 === 0,
            airConditioning: true,
            smokingAllowed: false,
            petsAllowed: i % 3 === 0,
            luggageSize: i % 2 ? 'medium' : 'large',
            chatPreference: 'friendly',
            notes: i === 0 ? 'التحرك في الموعد بالظبط، ممنوع التدخين. في مكان لشنطة كبيرة.' : undefined,
          }),
        ),
      );
    }
  }

  // A confirmed booking for the first passenger on the first trip
  const confirmed = await bookings.save(
    bookings.create({
      tripId: upcoming[0].id,
      passengerId: passengers[0].id,
      seatsCount: 1,
      totalAmount: 180,
      commissionAmount: 18,
      driverPayoutAmount: 162,
      commissionRate: 0.1,
      paymentMethod: PaymentMethod.CARD,
      status: BookingStatus.CONFIRMED,
      confirmedAt: new Date(),
    }),
  );
  await payments.save(payments.create({ bookingId: confirmed.id, amount: 180, status: PaymentStatus.PENDING, gatewayName: 'kashier', gatewayOrderId: confirmed.id }));

  // A request waiting for the driver
  const pending = await bookings.save(
    bookings.create({
      tripId: upcoming[0].id,
      passengerId: passengers[1].id,
      seatsCount: 2,
      totalAmount: 360,
      commissionAmount: 36,
      driverPayoutAmount: 324,
      commissionRate: 0.1,
      paymentMethod: PaymentMethod.CASH,
      status: BookingStatus.PENDING_DRIVER_APPROVAL,
    }),
  );
  await payments.save(payments.create({ bookingId: pending.id, amount: 360, status: PaymentStatus.CAPTURED, isCash: true }));

  // ── History ────────────────────────────────────────────────────────────────
  for (let k = 1; k <= 6; k++) {
    const driver = drivers[k % drivers.length];
    const passenger = passengers[k % passengers.length];
    const when = new Date(Date.now() - k * 4 * 24 * HOUR);
    const trip = await trips.save(
      trips.create({
        driverId: driver.id,
        originCity: k % 2 ? 'القاهرة' : 'الإسكندرية',
        destinationCity: k % 2 ? 'الإسكندرية' : 'القاهرة',
        departureTime: when,
        totalSeats: 4,
        availableSeats: 3,
        pricePerSeat: 180,
        status: TripStatus.COMPLETED,
        completedAt: new Date(when.getTime() + 3 * HOUR),
      }),
    );
    const card = k % 3 !== 0;
    const booking = await bookings.save(
      bookings.create({
        tripId: trip.id,
        passengerId: passenger.id,
        seatsCount: 1,
        totalAmount: 180,
        commissionAmount: 18,
        driverPayoutAmount: 162,
        commissionRate: 0.1,
        paymentMethod: card ? PaymentMethod.CARD : PaymentMethod.CASH,
        status: BookingStatus.TRIP_COMPLETED,
        confirmedAt: when,
        completedAt: trip.completedAt,
      }),
    );
    await payments.save(
      payments.create({ bookingId: booking.id, amount: 180, status: PaymentStatus.CAPTURED, isCash: !card, gatewayOrderId: booking.id, capturedAt: trip.completedAt }),
    );
    for (const [rater, ratee, role, score] of [
      [passenger, driver, RaterRole.PASSENGER, 5],
      [driver, passenger, RaterRole.DRIVER, 5 - (k % 2)],
    ] as const) {
      await ratings.save(
        ratings.create({
          tripId: trip.id,
          bookingId: booking.id,
          raterId: rater.id,
          rateeId: ratee.id,
          raterRole: role,
          score,
          comment: role === RaterRole.PASSENGER ? 'سواقة هادية والعربية نضيفة جداً' : 'راكب محترم وفي الموعد',
          isRevealed: true,
          revealAfter: new Date(),
        }),
      );
    }
  }

  console.log(
    `Seeded: admin ${admin.phoneNumber}, ${drivers.length} drivers, ${passengers.length + 1} passengers, ` +
      `${upcoming.length} upcoming trips. Log in with any ${PREFIX}xx number (OTP printed by the server).`,
  );
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
