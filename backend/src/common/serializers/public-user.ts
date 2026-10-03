import { User } from '../../database/entities/user.entity';

/**
 * The fields of a user that another user may see — a co-passenger, the driver of a
 * booked trip, someone reading trip comments or ratings.
 *
 * Endpoints used to return the raw User entity whenever a relation was loaded, which
 * handed every viewer the other person's phone number, national ID number and photo,
 * emergency contact, FCM token and promo balance. Anything shown to someone other than
 * the user themselves (or an admin) goes through here.
 */
export function toPublicUser(user: User | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    gender: user.gender ?? null,
    ratingAverage: user.ratingAverage,
    ratingCount: user.ratingCount,
    completedTripsAsDriver: user.completedTripsAsDriver,
    completedTripsAsPassenger: user.completedTripsAsPassenger,
    idVerified: user.idVerified,
    driverVerified: user.driverVerified,
    vehicleMake: user.vehicleMake ?? null,
    vehicleModel: user.vehicleModel ?? null,
    vehicleYear: user.vehicleYear ?? null,
    vehicleColor: user.vehicleColor ?? null,
  };
}

export type PublicUser = NonNullable<ReturnType<typeof toPublicUser>>;

/**
 * The driver as seen by a passenger who holds a booking on their trip. Adds the plate so
 * the passenger can check they are getting into the right car at pickup — a safety
 * detail that should not be visible to everyone browsing search results.
 */
export function toBookedDriver(user: User | null | undefined) {
  const base = toPublicUser(user);
  if (!base || !user) return base;
  return { ...base, vehiclePlate: user.vehiclePlate ?? null };
}
