/**
 * Driver subscriptions billed through Kashier (replacing Stripe, which does not onboard
 * merchants in Egypt). Uses its own phone-number range (+2011111003xx).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { User, UserStatus } from '../src/database/entities/user.entity';
import { Subscription } from '../src/database/entities/subscription.entity';
import {
  SubscriptionPayment,
  SubscriptionPaymentStatus,
} from '../src/database/entities/subscription-payment.entity';
import { PlatformConfig, CONFIG_KEYS } from '../src/database/entities/platform-config.entity';
import { KashierService } from '../src/modules/payments/kashier.service';
import { KashierController } from '../src/modules/payments/kashier.controller';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

const PREFIX = '+2011111003';

describe('Driver subscriptions via Kashier', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let subRepo: Repository<Subscription>;
  let subPaymentRepo: Repository<SubscriptionPayment>;
  let configRepo: Repository<PlatformConfig>;
  let kashier: KashierService;
  let kashierController: KashierController;
  let subscriptions: SubscriptionsService;
  let notifications: NotificationsService;

  let driver: User;
  let other: User;
  const DAY = 24 * 3_600_000;

  async function cleanup() {
    const users = await userRepo.find({ where: { phoneNumber: Like(`${PREFIX}%`) } });
    const ids = users.map((u) => u.id);
    if (ids.length) {
      await subPaymentRepo.delete({ userId: In(ids) });
      await subRepo.delete({ userId: In(ids) });
      await userRepo.manager.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await userRepo.delete({ id: In(ids) });
    }
  }

  // An "old" account so the 30-day free trial is over and the paywall applies
  async function makeUser(suffix: string) {
    const user = await userRepo.save(
      userRepo.create({ phoneNumber: `${PREFIX}${suffix}`, fullName: `Sub ${suffix}`, status: UserStatus.ACTIVE }),
    );
    await userRepo.query('UPDATE users SET created_at = $1 WHERE id = $2', [new Date(Date.now() - 60 * DAY), user.id]);
    return (await userRepo.findOneBy({ id: user.id }))!;
  }

  async function checkout(user: User) {
    jest.spyOn(kashier, 'createCheckoutSession').mockResolvedValue({
      sessionUrl: 'https://payments.kashier.io/session/s1', orderId: 'x', sessionId: 's1',
    });
    return subscriptions.createCheckout(user);
  }

  async function webhook(merchantOrderId: string, event: string, status: string) {
    jest.spyOn(kashier, 'verifyWebhookSignature').mockReturnValue(true);
    const res = { status: jest.fn() } as any;
    await kashierController.transactionWebhook(
      { event, data: { merchantOrderId, status, transactionId: 'TX-SUB', signatureKeys: ['status'] } },
      'sig',
      res,
    );
    return res.status.mock.calls.at(-1)?.[0];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    subRepo = moduleFixture.get(getRepositoryToken(Subscription));
    subPaymentRepo = moduleFixture.get(getRepositoryToken(SubscriptionPayment));
    configRepo = moduleFixture.get(getRepositoryToken(PlatformConfig));
    kashier = moduleFixture.get(KashierService);
    kashierController = moduleFixture.get(KashierController);
    subscriptions = moduleFixture.get(SubscriptionsService);
    notifications = moduleFixture.get(NotificationsService);

    await cleanup();
    driver = await makeUser('01');
    other = await makeUser('02');
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(notifications, 'sendToUser').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await subPaymentRepo.delete({ userId: In([driver.id, other.id]) });
    await subRepo.delete({ userId: In([driver.id, other.id]) });
  });

  it('after the free trial, an unsubscribed driver cannot post and sees the price', async () => {
    const status = await subscriptions.getStatus(driver.id);
    expect(status.isFreeTrial).toBe(false);
    expect(status.canPost).toBe(false);
    expect(status.priceEgp).toBeGreaterThan(0);
  });

  it('checkout opens a charged (not held) Kashier session for the configured price', async () => {
    const spy = jest.spyOn(kashier, 'createCheckoutSession').mockResolvedValue({
      sessionUrl: 'https://payments.kashier.io/session/s1', orderId: 'x', sessionId: 's1',
    });
    const { paymentId, sessionUrl } = await subscriptions.createCheckout(driver);
    expect(sessionUrl).toContain('kashier');
    const args = spy.mock.calls[0][0];
    expect(args.manualCapture).toBe(false);
    expect(args.merchantOrderId).toBe(`sub-${paymentId}`);
    const row = await subPaymentRepo.findOneByOrFail({ id: paymentId });
    expect(row.status).toBe(SubscriptionPaymentStatus.PENDING);
    expect(row.gatewaySessionId).toBe('s1');
  });

  it('a successful pay webhook activates the subscription exactly once', async () => {
    const { paymentId } = await checkout(driver);
    expect(await webhook(`sub-${paymentId}`, 'pay', 'SUCCESS')).toBe(200);

    const status = await subscriptions.getStatus(driver.id);
    expect(status.isActive).toBe(true);
    expect(status.canPost).toBe(true);
    const end = new Date(status.currentPeriodEnd!).getTime();
    expect(end).toBeGreaterThan(Date.now() + 29 * DAY);
    expect(end).toBeLessThan(Date.now() + 31 * DAY);

    // Replay: acknowledged as already applied and does not add another period
    expect(await webhook(`sub-${paymentId}`, 'pay', 'SUCCESS')).toBe(409);
    const again = await subscriptions.getStatus(driver.id);
    expect(new Date(again.currentPeriodEnd!).getTime()).toBe(end);
  });

  it('renewing early stacks the new period on the current end date', async () => {
    const first = await checkout(driver);
    await webhook(`sub-${first.paymentId}`, 'pay', 'SUCCESS');
    const second = await checkout(driver);
    await webhook(`sub-${second.paymentId}`, 'pay', 'SUCCESS');

    const end = new Date((await subscriptions.getStatus(driver.id)).currentPeriodEnd!).getTime();
    expect(end).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  it('a failed payment leaves the driver unsubscribed', async () => {
    const { paymentId } = await checkout(driver);
    expect(await webhook(`sub-${paymentId}`, 'pay', 'FAILURE')).toBe(200);
    expect((await subPaymentRepo.findOneByOrFail({ id: paymentId })).status).toBe(SubscriptionPaymentStatus.FAILED);
    expect((await subscriptions.getStatus(driver.id)).canPost).toBe(false);
  });

  it('the app confirming a payment Kashier has not settled applies nothing', async () => {
    const { paymentId } = await checkout(driver);
    jest.spyOn(kashier, 'getPaymentStatus').mockResolvedValue('PENDING');
    const result = await subscriptions.confirmPayment(paymentId, driver);
    expect(result.status).toBe(SubscriptionPaymentStatus.PENDING);
    expect((await subscriptions.getStatus(driver.id)).isActive).toBe(false);
  });

  it('the app confirming a payment Kashier reports captured activates it', async () => {
    const { paymentId } = await checkout(driver);
    jest.spyOn(kashier, 'getPaymentStatus').mockResolvedValue('CAPTURED');
    const result = await subscriptions.confirmPayment(paymentId, driver);
    expect(result.status).toBe(SubscriptionPaymentStatus.PAID);
    expect((await subscriptions.getStatus(driver.id)).isActive).toBe(true);
  });

  it("a user cannot confirm someone else's payment", async () => {
    const { paymentId } = await checkout(driver);
    await expect(subscriptions.confirmPayment(paymentId, other)).rejects.toThrow('Not your payment');
  });

  it('a lapsed subscription no longer allows posting and reports cancelled', async () => {
    const { paymentId } = await checkout(driver);
    await webhook(`sub-${paymentId}`, 'pay', 'SUCCESS');
    await subRepo.update({ userId: driver.id }, { currentPeriodEnd: new Date(Date.now() - DAY) });
    const status = await subscriptions.getStatus(driver.id);
    expect(status.canPost).toBe(false);
    expect(status.subscription?.status).toBe('cancelled');
  });

  it('a price of 0 switches the paywall off', async () => {
    const key = CONFIG_KEYS.SUBSCRIPTION_PRICE_EGP;
    const previous = await configRepo.findOneBy({ key });
    await configRepo.save({ key, value: '0', description: previous?.description ?? '' });
    try {
      expect((await subscriptions.getStatus(driver.id)).canPost).toBe(true);
      await expect(subscriptions.createCheckout(driver)).rejects.toThrow();
    } finally {
      await configRepo.save({ key, value: previous?.value ?? '200', description: previous?.description ?? '' });
    }
  });
});
