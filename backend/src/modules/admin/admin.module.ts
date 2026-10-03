import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../../database/entities/user.entity';
import { Trip } from '../../database/entities/trip.entity';
import { Booking } from '../../database/entities/booking.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    // ScheduleModule is registered once in AppModule; importing forRoot() here as well
    // was redundant.
    TypeOrmModule.forFeature([User, Trip, Booking, Payment, Dispute, PlatformConfig, RefreshToken]),
    PaymentsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
