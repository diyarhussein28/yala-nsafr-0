import { IsEnum, IsString, IsOptional, IsArray, IsUUID, MinLength, MaxLength, ArrayMaxSize } from 'class-validator';
import { DisputeReason, MAX_DISPUTE_EVIDENCE } from '../../../database/entities/dispute.entity';

export class OpenDisputeDto {
  @IsUUID()
  bookingId: string;

  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @IsString()
  @MinLength(10, { message: 'يرجى وصف المشكلة بتفصيل أكثر (10 أحرف على الأقل)' })
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DISPUTE_EVIDENCE)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidenceUrls?: string[];
}
