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

// Trip payments go through Kashier only. Stripe is used solely for driver
// subscriptions (see SubscriptionsModule). A legacy Stripe booking-payment endpoint
// used to live here: it let a passenger overwrite their Kashier order reference with a
// Stripe intent id — breaking capture of their own fare — and its webhook confirmed
// bookings without driver approval. It and the unused Paymob client were removed.
@Module({
  imports: [TypeOrmModule.forFeature([Booking, Payment, Trip, WithdrawalRequest]), NotificationsModule],
  controllers: [KashierController],
  providers: [KashierService, PaymentSettlementService],
  exports: [KashierService, PaymentSettlementService],
})
export class PaymentsModule {}
