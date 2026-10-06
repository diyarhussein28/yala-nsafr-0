import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../../database/entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SubmitIdVerificationDto } from './dto/submit-id-verification.dto';
import { SubmitDriverVerificationDto } from './dto/submit-driver-verification.dto';
import { StorageService } from '../upload/storage.service';
import { parseEgyptianNationalId } from '../../common/validation/egyptian-national-id';

const REFERRAL_WELCOME_CREDIT = 20;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  /** The user's own record, with private document references turned into signed links. */
  async getMe(user: User) {
    return {
      ...user,
      nationalIdPhotoUrl: await this.storage.viewUrl(user.nationalIdPhotoUrl),
      nationalIdBackPhotoUrl: await this.storage.viewUrl(user.nationalIdBackPhotoUrl),
      drivingLicencePhotoUrl: await this.storage.viewUrl(user.drivingLicencePhotoUrl),
      selfiePhotoUrl: await this.storage.viewUrl(user.selfiePhotoUrl),
    };
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getPublicProfile(id: string) {
    const user = await this.findById(id);
    return {
      id: user.id,
      fullName: user.fullName,
      profilePhotoUrl: user.profilePhotoUrl,
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount,
      completedTripsAsDriver: user.completedTripsAsDriver,
      cancelledTripsAsDriver: user.cancelledTripsAsDriver,
      completedTripsAsPassenger: user.completedTripsAsPassenger,
      idVerified: user.idVerified,
      driverVerified: user.driverVerified,
      vehicleMake: user.vehicleMake,
      vehicleModel: user.vehicleModel,
      vehicleYear: user.vehicleYear,
      vehicleColor: user.vehicleColor,
      allowsSmoking: user.allowsSmoking,
      allowsPets: user.allowsPets,
      gender: user.gender,
      memberSince: user.createdAt,
    };
  }

  async updateProfile(user: User, dto: UpdateProfileDto): Promise<User> {
    // Gender decides who may book women-only trips, so it can be set once and is then
    // locked — after ID verification it must match the national ID. It used to be freely
    // editable, so anyone could switch to "female" and book a women-only trip.
    if (dto.gender !== undefined && user.gender && dto.gender !== user.gender) {
      throw new BadRequestException('لا يمكن تغيير الجنس بعد تحديده. تواصل مع الدعم إن كان هناك خطأ.');
    }

    if (dto.profilePhotoUrl) this.storage.assertAcceptable(dto.profilePhotoUrl, user.id);

    const changes: Partial<User> = { ...dto };
    if (user.status === UserStatus.PENDING_VERIFICATION && dto.fullName) {
      changes.status = UserStatus.ACTIVE;
    }

    // Only the changed columns are written. Saving the whole entity loaded at the start
    // of the request could write stale values back over concurrent changes — an admin
    // ban, a promo deduction, a rating recount.
    if (Object.keys(changes).length > 0) {
      await this.userRepo.update(user.id, changes);
    }
    return this.findById(user.id);
  }

  async applyReferralCode(user: User, code: string): Promise<{ message: string; promoBalance: number }> {
    if (user.referredByUserId) {
      throw new BadRequestException('كود الدعوة تم تطبيقه بالفعل');
    }
    if (user.completedTripsAsPassenger > 0) {
      throw new BadRequestException('كود الدعوة يجب تطبيقه قبل أول رحلة');
    }

    const normalizedCode = code.trim().toUpperCase();
    const referrer = await this.userRepo.findOne({ where: { referralCode: normalizedCode } });
    if (!referrer) throw new NotFoundException('كود الدعوة غير صحيح');
    if (referrer.id === user.id) throw new BadRequestException('لا يمكنك استخدام كودك الخاص');

    user.referredByUserId = referrer.id;
    const current = parseFloat(user.promoBalance?.toString() ?? '0');
    user.promoBalance = +(current + REFERRAL_WELCOME_CREDIT).toFixed(2);
    await this.userRepo.save(user);

    return {
      message: `تم تطبيق كود الدعوة! حصلت على ${REFERRAL_WELCOME_CREDIT} جنيه رصيد ترحيبي`,
      promoBalance: user.promoBalance,
    };
  }

  async submitIdVerification(user: User, dto: SubmitIdVerificationDto): Promise<{ message: string }> {
    const parsed = parseEgyptianNationalId(dto.nationalIdNumber);
    if (!parsed) {
      throw new BadRequestException('الرقم القومي غير صحيح');
    }
    if (user.gender && user.gender !== parsed.gender) {
      throw new BadRequestException('الرقم القومي لا يطابق الجنس المسجّل في ملفك');
    }

    if (dto.nationalIdPhotoUrl) this.storage.assertAcceptable(dto.nationalIdPhotoUrl, user.id, { requirePrivate: true });
    if (dto.nationalIdBackPhotoUrl) {
      this.storage.assertAcceptable(dto.nationalIdBackPhotoUrl, user.id, { requirePrivate: true });
    }

    const taken = await this.userRepo.findOne({
      where: { nationalIdNumber: dto.nationalIdNumber },
      select: { id: true },
    });
    if (taken && taken.id !== user.id) {
      throw new BadRequestException('هذا الرقم القومي مسجّل بحساب آخر');
    }

    // A new submission is new evidence: it goes back to the admin queue. Keeping the old
    // approval let a verified user swap in a different ID number and photo while still
    // showing as verified.
    await this.userRepo.update(user.id, {
      nationalIdNumber: dto.nationalIdNumber,
      ...(dto.nationalIdPhotoUrl ? { nationalIdPhotoUrl: dto.nationalIdPhotoUrl } : {}),
      ...(dto.nationalIdBackPhotoUrl ? { nationalIdBackPhotoUrl: dto.nationalIdBackPhotoUrl } : {}),
      gender: parsed.gender,
      idVerified: false,
      idVerifiedAt: null as unknown as Date,
    });
    return { message: 'ID verification submitted. An admin will review it shortly.' };
  }

  async submitDriverVerification(user: User, dto: SubmitDriverVerificationDto): Promise<{ message: string }> {
    if (dto.drivingLicencePhotoUrl) {
      this.storage.assertAcceptable(dto.drivingLicencePhotoUrl, user.id, { requirePrivate: true });
    }
    if (dto.vehiclePhotoUrl) this.storage.assertAcceptable(dto.vehiclePhotoUrl, user.id);
    this.storage.assertAcceptable(dto.selfiePhotoUrl, user.id, { requirePrivate: true });
    // Same reasoning as the ID: changed licence or vehicle details must be re-reviewed,
    // otherwise a verified driver could switch to an unchecked car and plate.
    await this.userRepo.update(user.id, {
      ...dto,
      driverVerified: false,
      ...(user.role !== UserRole.ADMIN ? { role: UserRole.BOTH } : {}),
    });
    return { message: 'Driver verification submitted. An admin will review it shortly.' };
  }

  async updateFcmToken(userId: string, token: string): Promise<void> {
    await this.userRepo.update(userId, { fcmToken: token });
  }
}
