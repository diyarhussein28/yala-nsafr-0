import { IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  // Same format the send endpoint accepts, so a number can't be verified in a form it
  // could never have been sent to
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone number must be in E.164 format (e.g. +201234567890)' })
  phoneNumber: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  code: string;
}
