import { IsString, IsNumber, IsOptional, Min, Max, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

// Lengths mirror the user table's column sizes
export class SubmitDriverVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  drivingLicenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  drivingLicencePhotoUrl?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  vehicleMake: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  vehicleModel: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  vehicleYear: number;

  @IsString()
  @MinLength(2)
  @MaxLength(30)
  vehicleColor: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  vehiclePlate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  vehiclePhotoUrl?: string;

  // Required: the admin compares this face with the ID card before approving.
  @IsString({ message: 'صورتك الشخصية مطلوبة لتوثيق السائق' })
  @MaxLength(500)
  selfiePhotoUrl: string;
}
