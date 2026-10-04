import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { AppNotification } from '../../database/entities/notification.entity';
import { FirebaseService } from './firebase.service';
import { localizeNotificationText } from './notification-i18n';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** The payload in the recipient's language (texts are written in Arabic at the call site). */
function localize(payload: NotificationPayload, language: string | null | undefined): NotificationPayload {
  if (language !== 'en') return payload;
  return {
    ...payload,
    title: localizeNotificationText(payload.title, language),
    body: localizeNotificationText(payload.body, language),
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AppNotification)
    private readonly notifRepo: Repository<AppNotification>,
    private readonly firebase: FirebaseService,
  ) {}

  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, fcmToken: true, fullName: true, preferredLanguage: true },
    });

    if (!user) return;
    const localized = localize(payload, user.preferredLanguage);

    setImmediate(() => void this.persist(userId, localized));

    if (!user.fcmToken) {
      this.logger.debug(`No FCM token for ${user.fullName} — notification skipped`);
      return;
    }

    await this.dispatch(user.fcmToken, localized);
  }

  async sendToUsers(userIds: string[], payload: NotificationPayload): Promise<void> {
    if (userIds.length === 0) return;

    const users = await this.userRepo.find({
      where: { id: In(userIds) },
      select: { id: true, fcmToken: true, fullName: true, preferredLanguage: true },
    });

    // One multicast per language
    const byLanguage = new Map<string, User[]>();
    for (const user of users) {
      const language = user.preferredLanguage === 'en' ? 'en' : 'ar';
      byLanguage.set(language, [...(byLanguage.get(language) ?? []), user]);
    }
    for (const [language, group] of byLanguage) {
      await this.multicast(group, localize(payload, language));
    }
  }

  private async multicast(users: User[], payload: NotificationPayload): Promise<void> {
    setImmediate(() => void this.persistMany(users.map((u) => u.id), payload));

    const tokens = users.map((u) => u.fcmToken).filter(Boolean) as string[];
    if (tokens.length === 0) return;

    if (!this.firebase.isReady) {
      this.logger.log(`[NOTIF STUB] multicast → ${tokens.length} device(s): ${payload.title}`);
      return;
    }

    try {
      const response = await this.firebase.messaging!.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      this.logger.log(
        `Multicast: ${response.successCount} sent, ${response.failureCount} failed`,
      );
    } catch (err) {
      this.logger.error('FCM multicast error', err);
    }
  }

  async getForUser(userId: string, limit = 50, offset = 0): Promise<AppNotification[]> {
    return this.notifRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
      skip: offset,
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifRepo.count({ where: { userId, read: false } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.update({ userId, read: false }, { read: true });
  }

  private async persist(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      await this.notifRepo.save(
        this.notifRepo.create({
          userId,
          title: payload.title,
          body: payload.body,
          data: payload.data ?? null,
        }),
      );
    } catch (err) {
      this.logger.error('Failed to persist notification', err);
    }
  }

  private async persistMany(userIds: string[], payload: NotificationPayload): Promise<void> {
    try {
      const records = userIds.map((userId) =>
        this.notifRepo.create({
          userId,
          title: payload.title,
          body: payload.body,
          data: payload.data ?? null,
        }),
      );
      await this.notifRepo.save(records);
    } catch (err) {
      this.logger.error('Failed to persist notifications', err);
    }
  }

  private async dispatch(token: string, payload: NotificationPayload): Promise<void> {
    if (!this.firebase.isReady) {
      this.logger.log(`[NOTIF STUB] → ${token.slice(0, 12)}…: ${payload.title} — ${payload.body}`);
      return;
    }

    try {
      const messageId = await this.firebase.messaging!.send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      this.logger.debug(`FCM sent: ${messageId}`);
    } catch (err: any) {
      if (err?.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`Stale FCM token — clearing from user record`);
        await this.userRepo.update({ fcmToken: token }, { fcmToken: null! });
      } else {
        this.logger.error(`FCM send failed: ${err?.message ?? err}`);
      }
    }
  }
}
