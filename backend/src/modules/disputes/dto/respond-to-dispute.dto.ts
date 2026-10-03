import { IsString, IsOptional, IsArray, MinLength, MaxLength, ArrayMaxSize } from 'class-validator';

export class RespondToDisputeDto {
  @IsString()
  @MinLength(10, { message: 'Please provide a detailed response (at least 10 characters)' })
  @MaxLength(2000)
  response: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  evidenceUrls?: string[];
}
