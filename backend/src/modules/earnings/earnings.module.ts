import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';
import { DriverBalanceService } from './driver-balance.service';
import { Booking } from '../../database/entities/booking.entity';
import { Payment } from '../../database/entities/payment.entity';
import { WithdrawalRequest } from '../../database/entities/withdrawal-request.entity';
import { DriverLedgerEntry } from '../../database/entities/driver-ledger-entry.entity';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Payment, WithdrawalRequest, DriverLedgerEntry, PlatformConfig]),
    PaymentsModule,
  ],
  controllers: [EarningsController],
  providers: [EarningsService, DriverBalanceService],
  exports: [DriverBalanceService],
})
export class EarningsModule {}
