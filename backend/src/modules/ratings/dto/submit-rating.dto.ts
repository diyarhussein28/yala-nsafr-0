import { IsUUID, IsNumber, IsOptional, IsString, Min, Max, MaxLength, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitRatingDto {
  @IsUUID()
  bookingId: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(5)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
