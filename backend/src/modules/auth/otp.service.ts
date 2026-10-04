import { Injectable, BadRequestException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { randomInt, timingSafeEqual } from 'crypto';
import { SmsService } from '../sms/sms.service';
import { Otp } from '../../database/entities/otp.entity';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

// Every send costs an SMS and every new code is a fresh set of guesses. Without these
// caps a script could rotate codes indefinitely — 5 guesses per code, unlimited codes —
// or simply run up the SMS bill against any number.
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(Otp)
    private readonly otpRepo: Repository<Otp>,
    private readonly sms: SmsService,
  ) {}

  async sendOtp(phoneNumber: string): Promise<void> {
    if (!/^\+\d{7,15}$/.test(phoneNumber)) {
      throw new BadRequestException('Phone number must be in E.164 format (e.g. +201234567890)');
    }

    const lastHour = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.otpRepo.find({
      where: { phoneNumber, createdAt: MoreThan(lastHour) },
      order: { createdAt: 'DESC' },
      select: { id: true, createdAt: true },
    });
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        'تم إرسال عدد كبير من الرموز لهذا الرقم. حاول مرة أخرى بعد ساعة.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sinceLast = recent[0] ? (Date.now() - recent[0].createdAt.getTime()) / 1000 : Infinity;
    if (sinceLast < RESEND_COOLDOWN_SECONDS) {
      throw new HttpException(
        `انتظر ${Math.ceil(RESEND_COOLDOWN_SECONDS - sinceLast)} ثانية قبل طلب رمز جديد`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.otpRepo.update({ phoneNumber, used: false }, { used: true });

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.otpRepo.save({ phoneNumber, code, expiresAt });
    await this.dispatchSms(phoneNumber, code);
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
    const otp = await this.otpRepo.findOne({
      where: { phoneNumber, used: false },
      order: { createdAt: 'DESC' },
    });

    if (!otp) throw new BadRequestException('No OTP found for this number');
    if (new Date() > otp.expiresAt) throw new BadRequestException('OTP expired');

    // Count the attempt atomically before comparing. Reading the counter, comparing and
    // saving it back let a burst of parallel requests all pass the limit check at once,
    // turning 5 allowed guesses into as many as could be sent concurrently.
    const claimed = await this.otpRepo
      .createQueryBuilder()
      .update(Otp)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND attempts < :max AND used = false', { id: otp.id, max: MAX_ATTEMPTS })
      .execute();
    if (!claimed.affected) throw new BadRequestException('Too many attempts');

    if (!this.codesMatch(otp.code, code)) {
      throw new BadRequestException('Invalid OTP');
    }

    const consumed = await this.otpRepo.update({ id: otp.id, used: false }, { used: true });
    if (!consumed.affected) throw new BadRequestException('OTP already used');
    return true;
  }

  private codesMatch(expected: string, received: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // Math.random is not a cryptographic generator; its output can be predicted
  private generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  private async dispatchSms(phoneNumber: string, code: string): Promise<void> {
    if (this.sms.isStub) {
      this.logger.log(`[OTP STUB] ${phoneNumber} → ${code}`);
      return;
    }
    await this.sms.send(phoneNumber, `رمز التحقق يلا نسافر: ${code}\nصالح لمدة ${OTP_TTL_MINUTES} دقائق.`);
  }
}
