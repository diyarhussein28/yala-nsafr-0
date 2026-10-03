import { IsString, IsDateString, IsOptional, IsBoolean, IsNumber, Min, Max, MaxLength, IsInt } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class SearchTripsDto {
  @IsString()
  @MaxLength(100)
  originCity: string;

  @IsString()
  @MaxLength(100)
  destinationCity: string;

  @IsDateString()
  departureDate: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(8)
  seats?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  womenOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  smokingAllowed?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  petsAllowed?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
