import { IsIn, IsNumber, IsString, Max, MaxLength, Min, MinLength, NotEquals } from 'class-validator';
import { Type } from 'class-transformer';
import { LedgerEntryType } from '../../../database/entities/driver-ledger-entry.entity';

export class CreateLedgerEntryDto {
  @IsIn([LedgerEntryType.ADJUSTMENT, LedgerEntryType.CASH_COMMISSION_PAYMENT])
  type: LedgerEntryType.ADJUSTMENT | LedgerEntryType.CASH_COMMISSION_PAYMENT;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Min(-100000)
  @Max(100000)
  @NotEquals(0)
  amount: number;

  // Every manual money movement must say why
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  note: string;
}
