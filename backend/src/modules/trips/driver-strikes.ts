import { EntityManager } from 'typeorm';
import { User, UserStatus } from '../../database/entities/user.entity';
import { NotificationPayload } from '../notifications/notifications.service';

/**
 * A driver cancelling inside this many hours of departure, with passengers already
 * confirmed, gets a strike — the same as a trip the scheduler auto-cancels for never
 * starting. Before this, only the auto-cancel counted, so a driver could cancel by hand
 * an hour before departure, strand every passenger, and face no consequence at all.
 */
export const LATE_DRIVER_CANCEL_HOURS = 24;

/**
 * Records one cancellation strike and applies the repeat-offender policy:
 * 3 strikes → 7-day posting ban, 5 → 30 days, 10 → account suspended.
 * Returns the notification to send the driver once the caller's transaction commits.
 */
export async function applyDriverCancellationStrike(
  manager: EntityManager,
  driverId: string,
): Promise<{ strikes: number; notice: NotificationPayload | null }> {
  await manager.increment(User, { id: driverId }, 'cancellationStrikes', 1);

  const driver = await manager.findOne(User, {
    where: { id: driverId },
    select: { id: true, cancellationStrikes: true },
  });
  const strikes = driver?.cancellationStrikes ?? 0;

  if (strikes >= 10) {
    await manager.update(User, { id: driverId }, { status: UserStatus.SUSPENDED });
    return {
      strikes,
      notice: {
        title: '🚫 تم تعليق حسابك',
        body: 'تم تعليق حسابك بشكل دائم بسبب الإلغاء المتكرر. تواصل مع الدعم.',
        data: { screen: 'my_trips' },
      },
    };
  }
  if (strikes >= 5) {
    const bannedUntil = new Date(Date.now() + 30 * 24 * 3_600_000);
    await manager.update(User, { id: driverId }, { tripPostingBannedUntil: bannedUntil });
    return {
      strikes,
      notice: {
        title: '⚠️ تم تعليق نشر الرحلات 30 يوماً',
        body: 'بسبب الإلغاء المتكرر، لن تتمكن من نشر رحلات لمدة 30 يوماً.',
        data: { screen: 'my_trips' },
      },
    };
  }
  if (strikes >= 3) {
    const bannedUntil = new Date(Date.now() + 7 * 24 * 3_600_000);
    await manager.update(User, { id: driverId }, { tripPostingBannedUntil: bannedUntil });
    return {
      strikes,
      notice: {
        title: '⚠️ تم تعليق نشر الرحلات 7 أيام',
        body: `هذه إنذار ${strikes} — تم تعليق حقك في نشر رحلات لمدة 7 أيام.`,
        data: { screen: 'my_trips' },
      },
    };
  }
  return { strikes, notice: null };
}
