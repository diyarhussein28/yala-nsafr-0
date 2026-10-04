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
import { User } from '../../database/entities/user.entity';
import {
  CommissionPayment,
  CommissionPaymentStatus,
  COMMISSION_ORDER_PREFIX,
} from '../../database/entities/commission-payment.entity';
import {
  DriverLedgerEntry,
  LedgerEntryType,
} from '../../database/entities/driver-ledger-entry.entity';
import { KashierService } from './kashier.service';
import { NotificationsService } from '../notifications/notifications.service';

const PAID_STATUSES = new Set(['CAPTURED', 'SUCCESS', 'PAID']);

/**
 * Lets a driver pay the commission they owe on cash trips through Kashier. Same rules as
 * every other payment here: a charge (no hold), applied only after Kashier confirms it,
 * exactly once however many confirmations arrive.
 */
@Injectable()
export class CommissionBillingService {
  private readonly logger = new Logger(CommissionBillingService.name);

  constructor(
    @InjectRepository(CommissionPayment)
    private readonly paymentRepo: Repository<CommissionPayment>,
    private readonly dataSource: DataSource,
    private readonly kashier: KashierService,
    private readonly notifications: NotificationsService,
  ) {}

  static isCommissionOrder(merchantOrderId: string | null | undefined): boolean {
    return !!merchantOrderId && merchantOrderId.startsWith(COMMISSION_ORDER_PREFIX);
  }

  /** `amount` is computed by the caller from the driver's outstanding balance. */
  async createCheckout(driver: User, amount: number): Promise<{ paymentId: string; sessionUrl: string }> {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) throw new BadRequestException('لا توجد عمولة مستحقة عليك');

    const id = randomUUID();
    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        id,
        driverId: driver.id,
        amount: rounded,
        merchantOrderId: `${COMMISSION_ORDER_PREFIX}${id}`,
      }),
    );
    try {
      const { sessionUrl, sessionId } = await this.kashier.createCheckoutSession({
        merchantOrderId: payment.merchantOrderId,
        amount: rounded,
        manualCapture: false,
        customer: { name: driver.fullName, phone: driver.phoneNumber, reference: driver.id },
      });
      if (sessionId) await this.paymentRepo.update(payment.id, { gatewaySessionId: sessionId });
      return { paymentId: payment.id, sessionUrl };
    } catch (err) {
      await this.paymentRepo.update(payment.id, { status: CommissionPaymentStatus.FAILED });
      this.logger.error(`Commission checkout failed for ${driver.id}: ${String(err)}`);
      throw new BadRequestException('تعذّر فتح صفحة الدفع. يرجى المحاولة مجدداً.');
    }
  }

  async confirmForDriver(paymentId: string, driver: User) {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.driverId !== driver.id) throw new ForbiddenException('Not your payment');
    if (payment.status === CommissionPaymentStatus.PENDING) await this.verifyAndApply(payment);
    const fresh = await this.paymentRepo.findOneOrFail({ where: { id: paymentId } });
    return { status: fresh.status };
  }

  async confirmByMerchantOrderId(merchantOrderId: string): Promise<boolean> {
    const payment = await this.paymentRepo.findOne({ where: { merchantOrderId } });
    if (!payment || payment.status !== CommissionPaymentStatus.PENDING) {
      return payment?.status === CommissionPaymentStatus.PAID;
    }
    return this.verifyAndApply(payment);
  }

  private async verifyAndApply(payment: CommissionPayment): Promise<boolean> {
    if (this.kashier.isMock) return this.apply(payment.id);
    const status =
      (await this.kashier.getPaymentStatus(payment.gatewaySessionId)) ??
      (await this.kashier.getOrderStatus(payment.merchantOrderId));
    return status && PAID_STATUSES.has(status) ? this.apply(payment.id) : false;
  }

  /** Kashier transaction webhook for a commission order → HTTP status to answer with. */
  async handleWebhook(merchantOrderId: string, event: string, status: string): Promise<number> {
    const payment = await this.paymentRepo.findOne({ where: { merchantOrderId } });
    if (!payment) return 404;
    if (status === 'SUCCESS' && (event === 'pay' || event === 'capture')) {
      return (await this.apply(payment.id)) ? 200 : 409;
    }
    if ((status === 'FAILURE' && (event === 'pay' || event === 'authorize')) || event === 'reject') {
      const result = await this.paymentRepo.update(
        { id: payment.id, status: CommissionPaymentStatus.PENDING },
        { status: CommissionPaymentStatus.FAILED },
      );
      return result.affected ? 200 : 409;
    }
    return 409;
  }

  private async apply(paymentId: string): Promise<boolean> {
    let applied: CommissionPayment | null = null;
    await this.dataSource.transaction(async (manager) => {
      const claim = await manager.update(
        CommissionPayment,
        { id: paymentId, status: CommissionPaymentStatus.PENDING },
        { status: CommissionPaymentStatus.PAID, paidAt: new Date() },
      );
      if (!claim.affected) return;
      const payment = await manager.findOneOrFail(CommissionPayment, { where: { id: paymentId } });
      await manager.save(
        DriverLedgerEntry,
        manager.create(DriverLedgerEntry, {
          driverId: payment.driverId,
          type: LedgerEntryType.CASH_COMMISSION_PAYMENT,
          amount: Number(payment.amount),
          commissionPaymentId: payment.id,
          note: 'سداد عمولة رحلات الكاش عبر Kashier',
        }),
      );
      applied = payment;
    });
    if (!applied) return false;
    const { driverId, amount } = applied as CommissionPayment;
    setImmediate(() => {
      void this.notifications.sendToUser(driverId, {
        title: 'تم سداد العمولة ✅',
        body: `تم استلام ${amount} جنيه سداداً لعمولة رحلات الكاش. شكراً لك!`,
        data: { screen: 'earnings' },
      });
    });
    return true;
  }
}
