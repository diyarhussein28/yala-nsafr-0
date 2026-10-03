import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus } from '../../database/entities/subscription.entity';
import { User } from '../../database/entities/user.entity';
import { SubscriptionBillingService } from '../payments/subscription-billing.service';

const FREE_TRIAL_DAYS = 30;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly billing: SubscriptionBillingService,
  ) {}

  isInFreeTrial(user: User): boolean {
    const trialEnd = new Date(user.createdAt);
    trialEnd.setDate(trialEnd.getDate() + FREE_TRIAL_DAYS);
    return new Date() < trialEnd;
  }

  async getStatus(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const isFreeTrial = this.isInFreeTrial(user);
    const trialEnd = new Date(user.createdAt);
    trialEnd.setDate(trialEnd.getDate() + FREE_TRIAL_DAYS);
    const trialDaysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));

    const { priceEgp, periodDays } = await this.billing.getPricing();
    const subscription = await this.subRepo.findOne({ where: { userId } });
    const isActive =
      subscription?.status === SubscriptionStatus.ACTIVE &&
      !!subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > new Date();

    return {
      // A price of 0 switches the paywall off entirely
      canPost: priceEgp <= 0 || isFreeTrial || isActive,
      isFreeTrial,
      trialDaysLeft,
      isActive,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      priceEgp,
      periodDays,
      // Reported as cancelled once the paid period is over, so clients that read the
      // status field do not show a lapsed subscription as active
      subscription: subscription
        ? { ...subscription, status: isActive ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELLED }
        : null,
    };
  }

  createCheckout(user: User) {
    return this.billing.createCheckout(user);
  }

  confirmPayment(paymentId: string, user: User) {
    return this.billing.confirmForUser(paymentId, user);
  }

  async canUserPostTrip(userId: string): Promise<boolean> {
    const { canPost } = await this.getStatus(userId);
    return canPost;
  }
}
