import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Rating, RaterRole } from '../../database/entities/rating.entity';
import { Booking, BookingStatus } from '../../database/entities/booking.entity';
import { User } from '../../database/entities/user.entity';
import { SubmitRatingDto } from './dto/submit-rating.dto';
import { PlatformConfig, CONFIG_KEYS } from '../../database/entities/platform-config.entity';
import { toPublicUser } from '../../common/serializers/public-user';
import { Exclusive } from '../../common/jobs/exclusive';

// Fallbacks for a fresh database — platform_config (admin-editable) takes precedence.
// Ratings are revealed after 7 days if the other party hasn't submitted
const REVEAL_AFTER_DAYS = 7;

// Trust flag threshold: if average drops below this, flag for review
const LOW_RATING_THRESHOLD = 2.5;
const MIN_RATINGS_FOR_FLAG = 5;

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepo: Repository<Rating>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async submit(rater: User, dto: SubmitRatingDto): Promise<{ message: string }> {
    const booking = await this.bookingRepo.findOne({
      where: { id: dto.bookingId },
      relations: { trip: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // CONFIRMED used to be accepted too, which let either side rate a trip that had not
    // happened yet.
    if (booking.status !== BookingStatus.TRIP_COMPLETED) {
      throw new BadRequestException('Can only rate after a completed trip');
    }

    const isDriver = booking.trip.driverId === rater.id;
    const isPassenger = booking.passengerId === rater.id;

    if (!isDriver && !isPassenger) throw new ForbiddenException('Not your booking');

    const rateeId = isDriver ? booking.passengerId : booking.trip.driverId;
    const raterRole = isDriver ? RaterRole.DRIVER : RaterRole.PASSENGER;

    const existing = await this.ratingRepo.findOne({
      where: { bookingId: dto.bookingId, raterId: rater.id },
    });
    if (existing) throw new BadRequestException('You have already rated this trip');

    const revealDays = await this.getConfigNum(CONFIG_KEYS.RATING_REVEAL_DAYS, REVEAL_AFTER_DAYS);
    const revealAfter = new Date(Date.now() + revealDays * 24 * 3_600_000);

    await this.dataSource.transaction(async (manager) => {
      // Blind rating: a rating stays hidden until the other side has rated too, or the
      // reveal window runs out. Every rating used to be saved already revealed, so the
      // second person could see the first one's score before giving theirs — exactly
      // the retaliation the blind system is meant to prevent.
      const otherRating = await manager.findOne(Rating, {
        where: { bookingId: dto.bookingId, raterId: rateeId },
      });
      const bothRated = !!otherRating;

      const rating = manager.create(Rating, {
        tripId: booking.tripId,
        bookingId: dto.bookingId,
        raterId: rater.id,
        rateeId,
        raterRole,
        score: dto.score,
        comment: dto.comment,
        isRevealed: bothRated,
        revealAfter,
      });
      await manager.save(Rating, rating);

      if (bothRated) {
        if (!otherRating.isRevealed) {
          await manager.update(Rating, { id: otherRating.id }, { isRevealed: true });
        }
        await this.recalculateRating(manager, rateeId);
        await this.recalculateRating(manager, rater.id);
      }
    });

    return { message: 'شكراً! تم إرسال التقييم بنجاح.' };
  }

  private async getConfigNum(key: string, fallback: number): Promise<number> {
    const row = await this.dataSource.manager.findOne(PlatformConfig, { where: { key } });
    const value = row ? parseFloat(row.value) : NaN;
    return Number.isFinite(value) ? value : fallback;
  }

  private async recalculateRating(manager: EntityManager, userId: string): Promise<void> {
    const result = await manager
      .createQueryBuilder(Rating, 'r')
      .select('AVG(r.score)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.ratee_id = :userId AND r.is_revealed = true', { userId })
      .getRawOne();

    const average = parseFloat(result.avg ?? '0');
    const count = parseInt(result.count ?? '0', 10);

    await manager.update(User, userId, {
      ratingAverage: parseFloat(average.toFixed(2)),
      ratingCount: count,
    });

    // Trust & safety: flag if average is too low. Thresholds come from platform_config so
    // the values an admin edits are the ones applied.
    const [threshold, minRatings] = await Promise.all([
      this.getConfigNum(CONFIG_KEYS.LOW_RATING_THRESHOLD, LOW_RATING_THRESHOLD),
      this.getConfigNum(CONFIG_KEYS.MIN_RATINGS_FOR_FLAG, MIN_RATINGS_FOR_FLAG),
    ]);
    if (count >= minRatings && average < threshold) {
      await manager.update(User, userId, { trustFlagged: true });
    }
  }

  async getRevealedRatingsForUser(userId: string) {
    const ratings = await this.ratingRepo.find({
      where: { rateeId: userId, isRevealed: true },
      relations: { rater: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    // Raters are other people: only their public profile goes out
    return ratings.map((r) => ({ ...r, rater: toPublicUser(r.rater) }));
  }

  // Reveal ratings whose 7-day window has expired and recalculate affected users
  @Cron(CronExpression.EVERY_HOUR)
  @Exclusive()
  async revealExpiredRatings(): Promise<void> {
    const expired = await this.ratingRepo.find({
      where: { isRevealed: false, revealAfter: LessThanOrEqual(new Date()) },
    });
    if (expired.length === 0) return;

    await this.dataSource.transaction(async (manager) => {
      const ids = expired.map((r) => r.id);
      await manager.update(Rating, ids, { isRevealed: true });

      const affectedUsers = [...new Set(expired.map((r) => r.rateeId))];
      for (const userId of affectedUsers) {
        await this.recalculateRating(manager, userId);
      }
    });
  }
}
