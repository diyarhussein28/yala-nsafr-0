import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from '../../database/entities/trip.entity';
import { ShareController } from './share.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Trip])],
  controllers: [ShareController],
})
export class ShareModule {}
