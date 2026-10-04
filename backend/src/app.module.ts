import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/validate-env';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TripsModule } from './modules/trips/trips.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LocationModule } from './modules/location/location.module';
import { MessagesModule } from './modules/messages/messages.module';
import { EarningsModule } from './modules/earnings/earnings.module';
import { UploadModule } from './modules/upload/upload.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SosModule } from './modules/sos/sos.module';
import { HealthController } from './health.controller';
import { SmsModule } from './modules/sms/sms.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { JobLockRegistrar } from './common/jobs/exclusive';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    // A general per-client ceiling against scraping and brute force. Endpoints with a
    // cost per call (sending an OTP SMS) get tighter limits of their own.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database')!,
    }),
    SmsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    TripsModule,
    BookingsModule,
    RatingsModule,
    AdminModule,
    NotificationsModule,
    DisputesModule,
    PaymentsModule,
    LocationModule,
    MessagesModule,
    EarningsModule,
    UploadModule,
    SubscriptionsModule,
    BlocksModule,
    SchedulerModule,
    SosModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    JobLockRegistrar,
  ],
})
export class AppModule {}
