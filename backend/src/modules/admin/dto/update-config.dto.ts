import { IsNumber, IsOptional, Min, Max, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateConfigDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(0.5)
  commissionRate?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  autoConfirmHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  disputeWindowHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  disputeSlaHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  ratingRevealDays?: number;

  // Cancellation policy — seeded at startup but previously not editable through the API,
  // so the admin screen could show these values without being able to change them.
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(720)
  freeCancelHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(720)
  lateCancelHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  lateCancelFeePct?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  driverCompensationPct?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  lowRatingThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(1000)
  minRatingsForFlag?: number;

  // Driver subscription (billed through Kashier). 0 turns the paywall off.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Min(0)
  @Max(10000)
  subscriptionPriceEgp?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(366)
  subscriptionPeriodDays?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100000)
  cashCommissionLimitEgp?: number;
}
