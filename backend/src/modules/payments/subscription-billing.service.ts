import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User } from '../../database/entities/user.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../../database/entities/subscription.entity';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
  SUBSCRIPTION_ORDER_PREFIX,
} from '../../database/entities/subscription-payment.entity';
import { PlatformConfig, CONFIG_KEYS } from '../../database/entities/platform-config.entity';
import { KashierService } from './kashier.service';
import { NotificationsService } from '../notifications/notifications.service';

// Defaults for a fresh database; admins change them through platform_config.
// 200 EGP / 30 days is the price the app has always advertised.
export const DEFAULT_SUBSCRIPTION_PRICE_EGP = 200;
export const DEFAULT_SUBSCRIPTION_PERIOD_DAYS = 30;

// Kashier statuses that mean the money was actually taken. A subscription session is not
// manual-capture, so a mere AUTHORIZED hold does not count as paid.
const PAID_STATUSES = new Set(['CAPTURED', 'SUCCESS', 'PAID']);

/**
 * Driver subscription billing through Kashier.
 *
 * Stripe — the previous implementation — does not onboard merchants in Egypt, so the
 * subscription flow could never have gone live. Subscriptions are now prepaid periods
 * bought through the same Kashier account as trip fares: each confirmed payment extends
 * the subscription by one period from whichever is later, now or the current end date,
 * so renewing early never loses days.
 *
 * Lives in the payments module (rather than subscriptions) because the single Kashier
 * transaction webhook has to route subscription orders here; putting it in the
 * subscriptions module would create a module cycle.
 */
@Injectable()
export class SubscriptionBillingService {
  private readonly logger = new Logger(SubscriptionBillingService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPayment)
    private readonly subPaymentRepo: Repository<SubscriptionPayment>,
    @InjectRepository(PlatformConfig)
    private readonly configRepo: Repository<PlatformConfig>,
    private readonly dataSource: DataSource,
    private readonly kashier: KashierService,
    private readonly notifications: NotificationsService,
  ) {}

  static isSubscriptionOrder(merchantOrderId: string | null | undefined): boolean {
    return !!merchantOrderId && merchantOrderId.startsWith(SUBSCRIPTION_ORDER_PREFIX);
  }

  async getPricing(): Promise<{ priceEgp: number; periodDays: number }> {
    const [price, period] = await Promise.all([
      this.configRepo.findOne({ where: { key: CONFIG_KEYS.SUBSCRIPTION_PRICE_EGP } }),
      this.configRepo.findOne({ where: { key: CONFIG_KEYS.SUBSCRIPTION_PERIOD_DAYS } }),
    ]);
    const priceEgp = price ? Number(price.value) : DEFAULT_SUBSCRIPTION_PRICE_EGP;
    const periodDays = period ? Number(period.value) : DEFAULT_SUBSCRIPTION_PERIOD_DAYS;
    return {
      priceEgp: Number.isFinite(priceEgp) && priceEgp >= 0 ? priceEgp : DEFAULT_SUBSCRIPTION_PRICE_EGP,
      periodDays:
        Number.isFinite(periodDays) && periodDays > 0 ? Math.round(periodDays) : DEFAULT_SUBSCRIPTION_PERIOD_DAYS,
    };
  }

  /** Opens a Kashier checkout for one subscription period. */
  async createCheckout(user: User): Promise<{ paymentId: string; sessionUrl: string }> {
    const { priceEgp, periodDays } = await this.getPricing();
    if (priceEgp <= 0) {
      throw new BadRequestException('الاشتراك غير مطلوب حالياً — يمكنك نشر الرحلات مجاناً');
    }

    const id = randomUUID();
    const payment = await this.subPaymentRepo.save(
      this.subPaymentRepo.create({
        id,
        userId: user.id,
        amount: priceEgp,
        periodDays,
        status: SubscriptionPaymentStatus.PENDING,
        merchantOrderId: `${SUBSCRIPTION_ORDER_PREFIX}${id}`,
      }),
    );

    try {
      const { sessionUrl, sessionId } = await this.kashier.createCheckoutSession({
        merchantOrderId: payment.merchantOrderId,
        amount: priceEgp,
        manualCapture: false,
        customer: { name: user.fullName, phone: user.phoneNumber, reference: user.id },
      });
      if (sessionId) {
        await this.subPaymentRepo.update(payment.id, { gatewaySessionId: sessionId });
      }
      return { paymentId: payment.id, sessionUrl };
    } catch (err) {
      await this.subPaymentRepo.update(payment.id, { status: SubscriptionPaymentStatus.FAILED });
      this.logger.error(`Subscription checkout failed for ${user.id}: ${String(err)}`);
      throw new BadRequestException('تعذّر فتح صفحة الدفع. يرجى المحاولة مجدداً.');
    }
  }

  /**
   * Called by the app after the checkout page redirects back. The app's word is not
   * evidence of payment, so Kashier is asked directly before anything is applied.
   */
  async confirmForUser(paymentId: string, user: User) {
    const payment = await this.subPaymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== user.id) throw new ForbiddenException('Not your payment');

    if (payment.status === SubscriptionPaymentStatus.PENDING) {
      await this.verifyWithKashierAndApply(payment);
    }
    const fresh = await this.subPaymentRepo.findOneOrFail({ where: { id: paymentId } });
    return { status: fresh.status, periodEnd: fresh.periodEnd };
  }

  /** Public payment redirect: same verification, keyed by merchant order id. */
  async confirmByMerchantOrderId(merchantOrderId: string): Promise<boolean> {
    const payment = await this.subPaymentRepo.findOne({ where: { merchantOrderId } });
    if (!payment || payment.status !== SubscriptionPaymentStatus.PENDING) {
      return payment?.status === SubscriptionPaymentStatus.PAID;
    }
    return this.verifyWithKashierAndApply(payment);
  }

  private async verifyWithKashierAndApply(payment: SubscriptionPayment): Promise<boolean> {
    if (this.kashier.isMock) {
      // Development without Kashier credentials, mirroring /bookings/:id/mock-confirm
      return this.applyPayment(payment.id);
    }
    const status =
      (await this.kashier.getPaymentStatus(payment.gatewaySessionId)) ??
      (await this.kashier.getOrderStatus(payment.merchantOrderId));
    if (status && PAID_STATUSES.has(status)) {
      return this.applyPayment(payment.id);
    }
    this.logger.log(`Subscription payment ${payment.id} not paid yet (Kashier: ${status ?? 'unknown'})`);
    return false;
  }

  /**
   * Handles a verified Kashier transaction webhook for a subscription order. Returns the
   * HTTP status Kashier should get: 200 applied, 409 nothing new (replay), 404 unknown
   * order (retryable — the webhook can outrun our own commit).
   */
  async handleWebhook(
    merchantOrderId: string,
    event: string,
    status: string,
    ids: { kashierOrderId?: string; transactionId?: string },
  ): Promise<number> {
    const payment = await this.subPaymentRepo.findOne({ where: { merchantOrderId } });
    if (!payment) return 404;

    if (ids.kashierOrderId || ids.transactionId) {
      await this.subPaymentRepo.update(payment.id, {
        ...(ids.kashierOrderId ? { kashierOrderId: ids.kashierOrderId } : {}),
        ...(ids.transactionId ? { kashierTransactionId: ids.transactionId } : {}),
      });
    }

    const charged = status === 'SUCCESS' && (event === 'pay' || event === 'capture');
    const failed = status === 'FAILURE' && (event === 'pay' || event === 'authorize');

    if (charged) {
      return (await this.applyPayment(payment.id)) ? 200 : 409;
    }
    if (failed || event === 'reject') {
      const result = await this.subPaymentRepo.update(
        { id: payment.id, status: SubscriptionPaymentStatus.PENDING },
        { status: SubscriptionPaymentStatus.FAILED },
      );
      return result.affected ? 200 : 409;
    }
    if (status === 'SUCCESS' && (event === 'refund' || event === 'reversal')) {
      // A refunded subscription stops counting — an admin issued it, so the period goes
      this.logger.warn(`Subscription payment ${payment.id} was refunded at Kashier`);
    }
    return 409;
  }

  /**
   * Marks the payment paid and extends the subscription — exactly once, however many of
   * the webhook, the redirect and the app confirm it.
   */
  private async applyPayment(paymentId: string): Promise<boolean> {
    let applied: { userId: string; periodEnd: Date } | null = null;

    await this.dataSource.transaction(async (manager) => {
      const claim = await manager.update(
        SubscriptionPayment,
        { id: paymentId, status: SubscriptionPaymentStatus.PENDING },
        { status: SubscriptionPaymentStatus.PAID, paidAt: new Date() },
      );
      if (!claim.affected) return;

      const payment = await manager.findOneOrFail(SubscriptionPayment, { where: { id: paymentId } });
      let sub = await manager.findOne(Subscription, {
        where: { userId: payment.userId },
        lock: { mode: 'pessimistic_write' },
      });

      const now = new Date();
      const currentEnd = sub?.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      const periodEnd = new Date(currentEnd.getTime() + payment.periodDays * 24 * 3_600_000);

      if (!sub) {
        sub = manager.create(Subscription, { userId: payment.userId });
      }
      sub.status = SubscriptionStatus.ACTIVE;
      sub.currentPeriodEnd = periodEnd;
      sub.renewalReminderSentAt = null;
      await manager.save(Subscription, sub);

      await manager.update(SubscriptionPayment, paymentId, { periodStart: currentEnd, periodEnd });
      applied = { userId: payment.userId, periodEnd };
    });

    if (!applied) return false;
    const { userId, periodEnd } = applied as { userId: string; periodEnd: Date };
    this.logger.log(`Subscription extended for ${userId} until ${periodEnd.toISOString()}`);
    setImmediate(() => {
      void this.notifications.sendToUser(userId, {
        title: 'تم تفعيل اشتراكك ✅',
        body: `اشتراك يلا نسافر Pro نشط حتى ${periodEnd.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' })}.`,
        data: { screen: 'subscription' },
      });
    });
    return true;
  }

  /**
   * There is no automatic renewal (each period is a separate card payment), so drivers
   * are reminded before their period runs out rather than finding out when posting fails.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendRenewalReminders(): Promise<void> {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 3_600_000);
    const expiring = await this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :active', { active: SubscriptionStatus.ACTIVE })
      .andWhere('s.current_period_end > :now AND s.current_period_end <= :soon', { now, soon })
      .andWhere('s.renewal_reminder_sent_at IS NULL')
      .getMany();

    for (const sub of expiring) {
      await this.subRepo.update(sub.id, { renewalReminderSentAt: now });
      void this.notifications.sendToUser(sub.userId, {
        title: 'اشتراكك ينتهي قريباً',
        body: 'جدّد اشتراك يلا نسافر Pro لتستمر في نشر الرحلات دون انقطاع.',
        data: { screen: 'subscription' },
      });
    }
  }
}
