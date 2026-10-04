import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDateString,
  Min,
  Max,
  IsEnum,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  ArrayUnique,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LuggageSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export enum ChatPreference {
  SILENT = 'silent',
  FRIENDLY = 'friendly',
  TALKATIVE = 'talkative',
}

export class CreateTripDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  originCity: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originAddress?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  originLat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  originLng?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  destinationCity: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationAddress?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  destinationLat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  destinationLng?: number;

  @IsDateString()
  departureTime: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(8)
  totalSeats: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Min(1)
  @Max(10000)
  pricePerSeat: number;

  @IsOptional()
  @IsBoolean()
  womenOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  smokingAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  petsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  airConditioning?: boolean;

  @IsOptional()
  @IsEnum(LuggageSize)
  luggageSize?: LuggageSize;

  @IsOptional()
  @IsEnum(ChatPreference)
  chatPreference?: ChatPreference;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(100, { each: true })
  stops?: string[];
}

export class TripRepeatDto {
  /** Cairo weekdays to repeat on: 0 = Sunday … 6 = Saturday */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays: number[];

  @IsInt()
  @Min(1)
  @Max(12)
  weeks: number;
}

export class CreateTripSeriesDto extends CreateTripDto {
  @ValidateNested()
  @Type(() => TripRepeatDto)
  repeat: TripRepeatDto;
}
