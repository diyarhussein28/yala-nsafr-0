import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';

export class SubmitIdVerificationDto {
  @IsString()
  @Matches(/^\d{14}$/, { message: 'Egyptian national ID must be exactly 14 digits' })
  nationalIdNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nationalIdPhotoUrl?: string;
}
