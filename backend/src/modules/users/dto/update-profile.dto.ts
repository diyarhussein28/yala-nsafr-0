import { IsString, IsOptional, IsEnum, MinLength, MaxLength, IsIn, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { Gender } from '../../../database/entities/user.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Lengths mirror the column sizes: a longer value used to reach the database and come
// back as a 500 instead of a validation message.
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  profilePhotoUrl?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: 'رقم جهة الاتصال للطوارئ غير صحيح' })
  emergencyContactPhone?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  preferredLanguage?: string;
}
