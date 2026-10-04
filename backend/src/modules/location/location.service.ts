import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TripLocation } from '../../database/entities/trip-location.entity';
import { Trip, TripStatus } from '../../database/entities/trip.entity';
import { Booking, PARTICIPANT_BOOKING_STATUSES } from '../../database/entities/booking.entity';
import { PostLocationDto } from './dto/post-location.dto';
import { Exclusive } from '../../common/jobs/exclusive';

/**
 * GPS points are kept long enough to settle any dispute about the trip (the dispute
 * window is 48h by default, admins may need longer to review), then deleted. They used
 * to be kept forever — a full movement history of every driver, with no purpose after
 * the trip was settled.
 */
export const LOCATION_RETENTION_DAYS = 30;

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectRepository(TripLocation)
    private readonly locationRepo: Repository<TripLocation>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  async recordLocation(tripId: string, userId: string, dto: PostLocationDto): Promise<TripLocation> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== userId) throw new ForbiddenException('You are not the driver of this trip');
    if (trip.status !== TripStatus.ACTIVE) throw new BadRequestException('Trip is not active');

    const loc = this.locationRepo.create({
      tripId,
      latitude: dto.latitude,
      longitude: dto.longitude,
    });
    const saved = await this.locationRepo.save(loc);
    // The trip row carries the latest position too (for admin views and listings); these
    // columns existed but were never written.
    await this.tripRepo.update(tripId, {
      currentLat: dto.latitude,
      currentLng: dto.longitude,
      trackingUpdatedAt: saved.recordedAt,
    });
    return saved;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  @Exclusive()
  async purgeOldLocations(): Promise<number> {
    const cutoff = new Date(Date.now() - LOCATION_RETENTION_DAYS * 24 * 3_600_000);
    const result = await this.locationRepo
      .createQueryBuilder()
      .delete()
      .from(TripLocation)
      .where('recorded_at < :cutoff', { cutoff })
      .andWhere(
        `trip_id IN (SELECT id FROM trips WHERE status IN (:...done))`,
        { done: [TripStatus.COMPLETED, TripStatus.CANCELLED] },
      )
      .execute();
    if (result.affected) {
      this.logger.log(`Purged ${result.affected} GPS points older than ${LOCATION_RETENTION_DAYS} days`);
    }
    return result.affected ?? 0;
  }

  async getLatestLocation(tripId: string, userId: string): Promise<TripLocation | null> {
    await this.assertAccess(tripId, userId);
    return this.locationRepo.findOne({
      where: { tripId },
      order: { recordedAt: 'DESC' },
    });
  }

  /** Full GPS trail — intended for admin dispute review */
  async getTrail(tripId: string): Promise<TripLocation[]> {
    return this.locationRepo.find({
      where: { tripId },
      order: { recordedAt: 'ASC' },
    });
  }

  private async assertAccess(tripId: string, userId: string): Promise<void> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId === userId) return;

    const booking = await this.bookingRepo.findOne({
      where: {
        tripId,
        passengerId: userId,
        status: In(PARTICIPANT_BOOKING_STATUSES),
      },
    });
    if (!booking) throw new ForbiddenException('Not authorized to view this trip location');
  }
}
