import { EntityManager } from 'typeorm';
import { Booking } from '../../database/entities/booking.entity';
import { User } from '../../database/entities/user.entity';
import { ReferralReward } from '../../database/entities/referral-reward.entity';

export const REFERRAL_REWARD_EGP = 30;

/**
 * Gives back the promo credit a booking consumed, for any cancellation the passenger is
 * not at fault for — a driver rejection, an approval timeout, a failed or abandoned
 * payment, or the trip itself being cancelled. Previously only the passenger's own free
 * cancellation restored it, so every other path silently ate the credit.
 *
 * Callers must only invoke this on the single transition into a cancelled state (each
 * of those transitions is guarded by a status check), so the credit is restored once.
 */
export async function restorePromoCredit(
  manager: EntityManager,
  booking: Pick<Booking, 'passengerId' | 'promoDiscountAmount'>,
): Promise<void> {
  const amount = Number(booking.promoDiscountAmount ?? 0);
  if (amount > 0) {
    await manager.increment(User, { id: booking.passengerId }, 'promoBalance', amount);
  }
}

/**
 * Bookkeeping for passengers whose trip just completed: their completed-trip counter and,
 * on their first completed trip, the referral reward for whoever invited them.
 *
 * This only used to run on the two-sided confirm-completion path, so the normal flow —
 * the driver ending the trip — never counted passenger trips and never paid a referral
 * reward. Returns the referrers that were credited so the caller can notify them after
 * the transaction commits.
 */
export async function creditPassengerCompletion(
  manager: EntityManager,
  passengerIds: string[],
): Promise<string[]> {
  const rewarded: string[] = [];

  for (const passengerId of passengerIds) {
    await manager.increment(User, { id: passengerId }, 'completedTripsAsPassenger', 1);

    const passenger = await manager.findOne(User, {
      where: { id: passengerId },
      select: { id: true, referredByUserId: true },
    });
    if (!passenger?.referredByUserId) continue;

    const existing = await manager.findOne(ReferralReward, {
      where: { referredUserId: passengerId },
    });
    if (existing) continue;

    await manager.save(
      ReferralReward,
      manager.create(ReferralReward, {
        referrerId: passenger.referredByUserId,
        referredUserId: passengerId,
        amount: REFERRAL_REWARD_EGP,
      }),
    );
    await manager.increment(
      User,
      { id: passenger.referredByUserId },
      'promoBalance',
      REFERRAL_REWARD_EGP,
    );
    rewarded.push(passenger.referredByUserId);
  }

  return rewarded;
}
