import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KashierService } from './kashier.service';
import { KashierController } from './kashier.controller';
import { PaymentSettlementService } from './payment-settlement.service';
import { Booking } from '../../database/entities/booking.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Trip } from '../../database/entities/trip.entity';
import { WithdrawalRequest } from '../../database/entities/withdrawal-request.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Subscription } from '../../database/entities/subscription.entity';
import { SubscriptionPayment } from '../../database/entities/subscription-payment.entity';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { SubscriptionBillingService } from './subscription-billing.service';

// All payments go through Kashier: trip fares (authorize → capture escrow), driver
// payouts, and driver subscriptions (SubscriptionBillingService). Stripe was removed —
// it does not onboard merchants in Egypt. A legacy Stripe booking-payment endpoint
// used to live here: it let a passenger overwrite their Kashier order reference with a
// Stripe intent id — breaking capture of their own fare — and its webhook confirmed
// bookings without driver approval. It and the unused Paymob client were removed.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking, Payment, Trip, WithdrawalRequest, Subscription, SubscriptionPayment, PlatformConfig,
    ]),
    NotificationsModule,
  ],
  controllers: [KashierController],
  providers: [KashierService, PaymentSettlementService, SubscriptionBillingService],
  exports: [KashierService, PaymentSettlementService, SubscriptionBillingService],
})
export class PaymentsModule {}
